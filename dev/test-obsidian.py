"""UI acceptance against a disposable Obsidian vault (CDP port 9229).
Set TODO_TEST_VAULT to the absolute disposable vault path and create
.todo-lite-test-vault in it. The test clears only this plugin's data there.
Requires Python 3.10+ and playwright. Install the built plugin before running.
"""
import json
import os
import re
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

vault = Path(os.environ['TODO_TEST_VAULT']).resolve()
assert (vault / '.todo-lite-test-vault').is_file(), 'Disposable vault marker missing'
shots = Path(os.environ.get('TODO_TEST_SHOTS', '../obsidian-shots')).resolve()
shots.mkdir(parents=True, exist_ok=True)
checks = []
def passed(label):
    checks.append(label)
    print('PASS', label, flush=True)

with sync_playwright() as p:
    browser = p.chromium.connect_over_cdp(os.environ.get('TODO_TEST_CDP', 'http://127.0.0.1:9229'))
    context = browser.contexts[0]
    page = next(page for page in context.pages if page.url.startswith('app://obsidian.md'))
    actual = Path(page.evaluate('app.vault.adapter.basePath')).resolve()
    assert actual == vault, f'Wrong vault: {actual}'
    errors = []
    for existing in context.pages:
        existing.on('pageerror', lambda error: errors.append(str(error)))
    context.on('page', lambda new_page: new_page.on('pageerror', lambda error: errors.append(str(error))))
    page.on('dialog', lambda dialog: dialog.accept())
    try:
        # Reset test fixtures through the host in the verified disposable vault.
        page.evaluate('''async () => {
          app.setting.close();
          app.workspace.getLeavesOfType('todo-lite-board').forEach(leaf => leaf.detach());
          await app.plugins.disablePluginAndSave('todo-lite');
          const file = '.obsidian/plugins/todo-lite/data.json';
          if (await app.vault.adapter.exists(file)) await app.vault.adapter.remove(file);
          await app.plugins.setEnable(true);
          await app.plugins.loadManifests();
          await app.plugins.enablePluginAndSave('todo-lite');
          await app.plugins.getPlugin('todo-lite').openBoard();
        }''')
        board = page.frame_locator('iframe.todo-lite-board-frame')
        expect(board.locator('header button')).to_have_count(1)
        expect(board.get_by_role('button', name='编辑布局', exact=True)).to_be_visible()
        assert page.evaluate("app.plugins.getPlugin('todo-lite').store.doc.items.length") == 0
        assert page.evaluate("app.plugins.getPlugin('todo-lite').store.doc.sections.length") == 0
        passed('empty first launch; only Edit layout in the board toolbar')

        board.get_by_role('button', name='编辑布局', exact=True).click()
        board.get_by_text('＋ 加一块新的分区', exact=True).click()
        board.get_by_placeholder('新分区的名字').fill('验收分区')
        board.get_by_placeholder('新分区的名字').press('Enter')
        expect(board.get_by_role('heading', name='验收分区', exact=True)).to_be_visible()
        board.get_by_role('button', name='完成编辑', exact=True).click()
        board.get_by_role('button', name='＋ 添加', exact=True).click()
        board.get_by_placeholder('要做的事').fill('待办验收')
        board.get_by_placeholder('要做的事').press('Enter')
        row = board.locator('.items .item').filter(has=board.locator('.t', has_text='待办验收'))
        expect(row).to_have_count(1)
        row.hover()
        row.get_by_title('编辑', exact=True).click()
        board.get_by_placeholder('要做的事').fill('编辑后的待办')
        board.get_by_placeholder('备注', exact=True).fill('保存备注')
        board.get_by_placeholder('截止：无', exact=True).fill('2026-11-20')
        board.get_by_role('button', name='保存', exact=True).click()
        row = board.locator('.items .item').filter(has=board.locator('.t', has_text='编辑后的待办'))
        expect(row).to_contain_text('保存备注')
        row.locator('button.pill').click()
        board.locator('.pop .opt').filter(has_text='做完了').click()
        expect(row).to_have_class(re.compile(r'\bdone\b'))
        passed('create section and task; edit title, note, due date; complete task')

        board.get_by_role('button', name='＋ 添加', exact=True).click()
        board.get_by_placeholder('要做的事').fill('每日打卡验收')
        board.get_by_placeholder('要做的事').press('Enter')
        habit = board.locator('.items .item').filter(has=board.locator('.t', has_text='每日打卡验收'))
        expect(habit).to_have_count(1)
        habit.locator('button.pill').click()
        board.locator('.pop .opt').filter(has_text='设为重复').click()
        board.get_by_role('button', name='每天', exact=True).click()
        board.locator('.pop').get_by_role('button', name='完成', exact=True).click()
        expect(habit.locator('.pill')).to_have_attribute('aria-label', '今天要做')
        habit.locator('.pill').click()
        expect(habit.locator('.pill')).to_have_attribute('aria-label', '今天做完')
        habit.locator('.pill').click()
        expect(habit.locator('.pill')).to_have_attribute('aria-label', '今天要做')
        habit.locator('.pill').click()
        expect(habit.locator('.pill')).to_have_attribute('aria-label', '今天做完')
        expect(board.locator('.hab .nm').filter(has_text='每日打卡验收')).to_have_count(1)
        passed('configure daily habit; check in, undo and check in again')

        # Obsidian 1.14 opens Settings in a separate window; older versions use a modal.
        page.evaluate("() => { app.setting.open(); app.setting.openTabById('todo-lite'); }")
        settings_page = None
        for _ in range(80):
            settings_page = next((candidate for candidate in context.pages if candidate.locator('iframe.todo-lite-settings-frame').count()), None)
            if settings_page: break
            page.wait_for_timeout(100)
        assert settings_page, 'Settings frame missing'
        settings = settings_page.frame_locator('iframe.todo-lite-settings-frame')
        expect(settings.get_by_text('外观', exact=True)).to_be_visible()
        expect(settings.get_by_role('button', name='编辑布局', exact=True)).to_have_count(0)
        title = settings.locator('.field').filter(has=settings.locator('span', has_text=re.compile('^标题$')))
        title.locator('input').fill('验收看板')
        title.locator('input').press('Enter')
        expect(board.locator('header .brand')).to_have_text('验收看板')
        today = settings.locator('.field').filter(has=settings.locator('span', has_text=re.compile('^今日工作$')))
        today.get_by_role('button', name='不显示', exact=True).click()
        expect(board.get_by_role('heading', name='今日工作', exact=True)).to_have_count(0)
        today.get_by_role('button', name='显示', exact=True).click()
        expect(board.get_by_role('heading', name='今日工作', exact=True)).to_be_visible()
        mode = settings.locator('.field').filter(has=settings.locator('span', has_text=re.compile('^明暗$')))
        mode.get_by_role('button', name='暗', exact=True).click()
        expect(board.locator('html')).to_have_attribute('data-mode', 'dark')
        mode.get_by_role('button', name='跟随系统', exact=True).click()
        settings_page.screenshot(path=str(shots / 'settings.png'))
        page.evaluate('() => { app.setting.close(); }')
        passed('Obsidian settings window saves title, visibility and appearance; board updates immediately')

        disk = page.evaluate("app.plugins.getPlugin('todo-lite').loadData()")
        assert len(disk['items']) == 2 and disk['theme']['title'] == '验收看板'
        assert next(item for item in disk['items'] if item['title'] == '每日打卡验收')['doneDates']
        page.evaluate('''async () => {
          app.workspace.getLeavesOfType('todo-lite-board').forEach(leaf => leaf.detach());
          await app.plugins.unloadPlugin('todo-lite');
          await app.plugins.loadPlugin('todo-lite');
          await app.plugins.getPlugin('todo-lite').openBoard();
        }''')
        board = page.frame_locator('iframe.todo-lite-board-frame')
        expect(board.locator('header .brand')).to_have_text('验收看板')
        expect(board.locator('.items .item.done').filter(has_text='编辑后的待办')).to_have_count(1)
        expect(board.locator('.items .item .pill[aria-label="今天做完"]')).to_have_count(1)
        page.screenshot(path=str(shots / 'board.png'))
        passed('unload and reload plugin: layout, task status, habit check-in and settings survive')

        # Full host reload exercises restored workspace views and onload ordering.
        page.reload()
        expect(page.frame_locator('iframe.todo-lite-board-frame').locator('header .brand')).to_have_text('验收看板', timeout=20000)
        passed('full Obsidian window reload restores the saved board')
        assert not errors, errors
        passed('no uncaught JavaScript errors')
        (shots / 'results.json').write_text(json.dumps({'passed': checks, 'errors': errors}, ensure_ascii=False, indent=2),encoding='utf-8')
    except Exception:
        page.screenshot(path=str(shots / 'failure.png'))
        raise
    finally:
        browser.close()
