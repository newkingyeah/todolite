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

    def page_with(selector):
        for _ in range(80):
            found = next((candidate for candidate in context.pages if candidate.locator(selector).count()), None)
            if found:
                return found
            page.wait_for_timeout(100)
        raise AssertionError(f'Missing {selector}')

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
        labels = board.locator('main > .container > section').evaluate_all('(blocks) => blocks.map(block => block.dataset.toc)')
        assert labels == ['今日工作', '日历', '验收分区'], labels
        passed('today, calendar and sections render in that order')
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
        settings_page = page_with('.todo-lite-settings')
        settings = settings_page.locator('.todo-lite-settings')
        expect(settings.locator('.setting-item-heading').get_by_text('外观', exact=True)).to_be_visible()
        expect(settings.locator('iframe')).to_have_count(0)
        expect(settings.get_by_role('button', name='编辑布局', exact=True)).to_have_count(0)
        title = settings.get_by_label('看板标题', exact=True)
        title.fill('验收看板')
        title.press('Enter')
        expect(board.locator('header .brand')).to_have_text('验收看板')
        today = settings.get_by_label('显示今日工作', exact=True)
        today.click()
        expect(board.get_by_role('heading', name='今日工作', exact=True)).to_have_count(0)
        today.click()
        expect(board.get_by_role('heading', name='今日工作', exact=True)).to_be_visible()
        mode = settings.get_by_label('看板主题', exact=True)
        mode.select_option('dark')
        expect(board.locator('html')).to_have_attribute('data-mode', 'dark')
        font_size = settings.get_by_label('字号', exact=True)
        font_size.press('ArrowRight')
        expect(font_size).to_have_value('15.5')
        expect(board.locator('html')).to_have_attribute('style', re.compile(r'--fs:\s*15\.5px'))
        card_style = settings.get_by_label('今日工作卡片', exact=True)
        card_style.select_option('buttons')
        expect(settings.get_by_label('标记完成的手势', exact=True)).to_be_hidden()
        card_style.select_option('gesture')
        expect(settings.get_by_label('标记完成的手势', exact=True)).to_be_visible()
        passed('native text, toggle, slider and dropdown save and immediately update the board')

        font = settings.get_by_label('看板字体', exact=True)
        font.select_option(label='自定义')
        custom_font = settings.get_by_label('自定义看板字体', exact=True)
        custom_font.fill('Microsoft YaHei')
        custom_font.press('Tab')
        page.wait_for_function("app.plugins.getPlugin('todo-lite').store.doc.theme.font === 'Microsoft YaHei'")
        font.select_option('default')
        expect(custom_font).to_be_hidden()

        section = settings.get_by_label('显示分区 验收分区', exact=True)
        section.click()
        expect(board.get_by_role('heading', name='验收分区', exact=True)).to_have_count(0)
        section.click()
        expect(board.get_by_role('heading', name='验收分区', exact=True)).to_be_visible()

        location = settings.get_by_label('新运行位置', exact=True)
        location.fill('临时 Agent')
        location.press('Enter')
        expect(settings.get_by_text('临时 Agent', exact=True)).to_be_visible()
        settings.get_by_role('button', name='重命名', exact=True).click()
        rename_page = page_with('.modal input[aria-label="位置名称"]')
        renamed = rename_page.get_by_label('位置名称', exact=True)
        renamed.fill('新位置')
        renamed.press('Enter')
        expect(settings.get_by_text('新位置', exact=True)).to_be_visible()
        settings.get_by_role('button', name='移除', exact=True).click()
        expect(settings.get_by_text('新位置', exact=True)).to_have_count(0)
        passed('custom font, section visibility and Agent location management work in native settings')

        settings.get_by_role('button', name='预览打卡完成').click()
        preview = settings.frame_locator('iframe[title="动效示例"]')
        expect(preview.locator('.card')).to_be_visible()
        settings.get_by_role('button', name='收起', exact=True).click()
        expect(settings.locator('iframe')).to_have_count(0)

        css = settings.get_by_label('看板 CSS', exact=True)
        css.fill('.card { border-width: 2px; }')
        settings.get_by_role('button', name='保存 CSS', exact=True).click()
        expect(board.locator('#b-calendar .card').first).to_have_css('border-top-width', '2px')
        settings.get_by_role('button', name='恢复默认外观', exact=True).click()
        reset_page = page_with('.modal-title:text-is("恢复默认外观")')
        reset = reset_page.locator('.modal').filter(has_text='看板主题、布局、头图、动效和自定义 CSS 将恢复默认值。')
        reset.get_by_role('button', name='取消', exact=True).click()
        expect(css).to_have_value('.card { border-width: 2px; }')
        settings.get_by_role('button', name='恢复默认外观', exact=True).click()
        reset.get_by_role('button', name='恢复', exact=True).click()
        expect(css).to_have_value('')
        expect(title).to_have_value('ToDo')
        title.fill('验收看板')
        title.press('Enter')
        expect(board.locator('header .brand')).to_have_text('验收看板')
        passed('effect preview, custom CSS and confirmed reset work without changing tasks')

        original_theme = page.evaluate("app.vault.getConfig('theme')")
        try:
            page.evaluate("() => { app.changeTheme('moonstone'); app.updateTheme(); }")
            expect(settings_page.locator('body')).to_have_class(re.compile(r'\btheme-light\b'))
            light_text = title.evaluate('element => getComputedStyle(element).color')
            title.scroll_into_view_if_needed()
            settings_page.screenshot(path=str(shots / 'settings-light.png'))
            page.evaluate("() => { app.changeTheme('obsidian'); app.updateTheme(); }")
            expect(settings_page.locator('body')).to_have_class(re.compile(r'\btheme-dark\b'))
            expect(board.locator('html')).to_have_attribute('data-mode', 'dark')
            assert title.evaluate('element => getComputedStyle(element).color') != light_text
            mode.select_option('light')
            expect(board.locator('html')).to_have_attribute('data-mode', 'light')
            expect(settings_page.locator('body')).to_have_class(re.compile(r'\btheme-dark\b'))
            mode.select_option('auto')
            expect(board.locator('html')).to_have_attribute('data-mode', 'dark')
            settings_page.screenshot(path=str(shots / 'settings-dark.png'))

            # Restrict the content slot to a narrow pane for a deterministic layout check.
            settings.evaluate("panel => { panel.style.maxWidth = '360px'; }")
            narrow = settings.evaluate('''panel => {
              const input = panel.querySelector('[aria-label="看板标题"]');
              const label = input.closest('.setting-item').querySelector('.setting-item-name');
              return { width: panel.clientWidth, scrollWidth: panel.scrollWidth,
                stacked: input.getBoundingClientRect().top >= label.getBoundingClientRect().bottom };
            }''')
            assert narrow['width'] <= 360 and narrow['scrollWidth'] <= narrow['width'] and narrow['stacked'], narrow
            settings_page.screenshot(path=str(shots / 'settings-narrow.png'))
            settings.evaluate("panel => { panel.style.removeProperty('max-width'); }")
        finally:
            page.evaluate("theme => { app.changeTheme(theme || 'system'); app.updateTheme(); }", original_theme)
            page.evaluate('() => { app.setting.close(); }')
        passed('settings inherit the Obsidian light and dark themes and fit a narrow pane')

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
