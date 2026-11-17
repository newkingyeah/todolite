import { Modal, Notice, PluginSettingTab, Setting } from 'obsidian';
import { actions } from '../web/lib/api.js';
import { closedModeOf, recentDaysOf } from '../web/lib/done.js';
import { fxOf, fxOptions } from '../web/lib/fx/index.js';
import { seenFxOf, seenFxOptions } from '../web/lib/fx/seen.js';
import { HEROES, heroById } from '../web/lib/heroes/index.js';
import { sections } from '../web/lib/model.js';
import { MOVES, moveOf } from '../web/lib/motion.js';
import { placesByRecency } from '../web/lib/places.js';
import { ACCENT_OPTIONS, agentCardOf, agentColsOf, agentDoneOf } from '../web/lib/theme.js';
import { ago } from '../web/lib/time.js';

function onEnter(input, commit) {
  input.addEventListener('keydown', event => {
    if (event.key !== 'Enter' || event.isComposing || event.keyCode === 229) return;
    event.preventDefault();
    commit();
  });
}

function onTextCommit(input, commit) {
  input.addEventListener('blur', () => commit(input.value.trim()));
  onEnter(input, () => input.blur());
}

export class TodoSettingsTab extends PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
    this.observers = [];
    this.act = actions(async (method, path, body, message) => {
      try {
        await this.store.request(method, path, body);
        if (message) new Notice(message);
        return true;
      } catch (error) {
        new Notice(`保存失败：${error.message}`);
        return false;
      }
    });
  }

  get store() { return this.plugin.store; }

  display() {
    this.hide();
    this.containerEl.empty();
    const panel = this.containerEl.createDiv({ cls: 'todo-lite-settings' });
    this.appearance(panel);
    this.board(panel);
    this.effects(panel);
    this.places(panel);
    this.sections(panel);
    this.customStyle(panel);
  }

  hide() {
    this.dialog?.close();
    this.preview?.empty();
    this.preview = null;
    this.observers.length = 0;
  }

  // Keep the native controls in place while a save or a board edit refreshes their values.
  refresh(doc) { for (const observer of this.observers) observer(doc); }

  observe(read, render) {
    let last = Symbol();
    const observer = doc => {
      const value = read(doc);
      if (Object.is(value, last)) return;
      last = value;
      render(value);
    };
    this.observers.push(observer);
    observer(this.store.doc);
  }

  bind(component, element, name, read, save, format = value => value) {
    element.setAttribute('aria-label', name);
    this.observe(read, value => component.setValue(format(value)));
    component.onChange(async value => {
      if (!await save(value) && component.getValue() === value) component.setValue(format(read(this.store.doc)));
    });
  }

  select(panel, name, key, options, getValue = theme => theme[key]) {
    const values = new Map(options.map(([value, label]) => [String(value), { value, label }]));
    return new Setting(panel).setName(name).addDropdown(select => {
      for (const [id, { label }] of values) select.addOption(id, label);
      this.bind(select, select.selectEl, name, doc => getValue(doc.theme),
        id => this.act.theme({ [key]: values.get(id).value }), value => String(value));
    });
  }

  toggle(panel, name, key) {
    return new Setting(panel).setName(name).addToggle(toggle => {
      this.bind(toggle, toggle.toggleEl, name, doc => doc.theme[key] !== false, value => this.act.theme({ [key]: value }));
    });
  }

  slider(panel, name, key, limits, suffix, scope = 'theme') {
    return new Setting(panel).setName(name).addSlider(slider => {
      slider.setLimits(...limits).setDynamicTooltip();
      slider.setDisplayFormat?.(value => `${value}${suffix}`);
      this.bind(slider, slider.sliderEl, name, doc => doc[scope][key], value => this.act[scope]({ [key]: value }));
    });
  }

  preset(panel, name, key, options, placeholder) {
    const presets = new Set(options.map(([value]) => value));
    const custom = 'todo-lite-custom';
    let select, input;
    new Setting(panel).setName(name).addDropdown(control => { select = control; }).addText(text => { input = text.inputEl; });
    for (const [value, label] of options) select.addOption(value, label);
    select.addOption(custom, '自定义');
    select.selectEl.setAttribute('aria-label', name);
    input.placeholder = placeholder;
    input.setAttribute('aria-label', `自定义${name}`);
    const update = value => {
      const isPreset = presets.has(value);
      select.setValue(isPreset ? value : custom);
      input.hidden = isPreset;
      input.value = isPreset ? '' : value;
    };
    this.observe(doc => doc.theme[key], update);
    select.onChange(async value => {
      if (value === custom) {
        input.hidden = false;
        input.focus();
      } else if (!await this.act.theme({ [key]: value })) {
        update(this.store.doc.theme[key]);
      }
    });
    onTextCommit(input, value => {
      if (value) return this.act.theme({ [key]: value });
      if (select.getValue() === custom) update(this.store.doc.theme[key]);
    });
  }

  appearance(panel) {
    new Setting(panel).setName('外观').setHeading();
    new Setting(panel).setName('看板标题').addText(text => {
      text.inputEl.setAttribute('aria-label', '看板标题');
      this.observe(doc => doc.theme.title, value => text.setValue(value));
      onTextCommit(text.inputEl, title => this.act.theme({ title }));
    });
    this.select(panel, '看板主题', 'mode', [['auto', '跟随 Obsidian'], ['light', '浅色'], ['dark', '深色']]);
    this.preset(panel, '看板字体', 'font', [['default', '默认字体'], ['system', '系统字体']], '输入字体名');
    this.slider(panel, '字号', 'fontSize', [13, 18, 0.5], ' px');
    this.slider(panel, '最大宽度', 'width', [760, 1600, 20], ' px');
    this.slider(panel, '卡片圆角', 'radius', [0, 24, 1], ' px');
    this.preset(panel, '强调色', 'accent', ACCENT_OPTIONS, '例如 #557791');
  }

  board(panel) {
    new Setting(panel).setName('看板与显示').setHeading();
    this.select(panel, '内容密度', 'density', [['comfortable', '宽松'], ['compact', '紧凑']]);
    this.select(panel, '分区排版', 'layout', [['sidebar', '标题在左'], ['stacked', '标题在上']]);
    this.select(panel, '今日工作列数', 'agentCols', [[1, '一列'], [2, '两列'], [3, '三列']], agentColsOf);
    this.select(panel, '今日工作卡片', 'agentCard', [['gesture', '手势'], ['buttons', '按钮']], agentCardOf);
    const done = this.select(panel, '标记完成的手势', 'agentDone', [['slide', '滑动'], ['hold', '长按']], agentDoneOf);
    this.observe(doc => agentCardOf(doc.theme), mode => { done.settingEl.hidden = mode !== 'gesture'; });
    this.toggle(panel, '显示今日工作', 'showToday');
    this.toggle(panel, '显示日历', 'showCalendar');
    this.toggle(panel, '显示目录', 'showToc');
    this.select(panel, '已完成事项', 'closedMode', [['none', '隐藏'], ['recent', '最近完成'], ['all', '全部显示']], closedModeOf);
    const days = this.select(panel, '保留最近完成', 'recentDays', [1, 3, 7].map(day => [day, `${day} 天`]), recentDaysOf);
    this.observe(doc => closedModeOf(doc.theme), mode => { days.settingEl.hidden = mode !== 'recent'; });

    new Setting(panel).setName('头图').setHeading();
    this.toggle(panel, '显示头图', 'hero');
    this.select(panel, '头图样式', 'heroStyle', HEROES.map(({ id, name }) => [id, name]), theme => heroById(theme.heroStyle).id);
    this.slider(panel, '头图高度', 'heroHeight', [140, 360, 10], ' px');
  }

  effects(panel) {
    new Setting(panel).setName('动效').setHeading();
    const effects = [
      ['Agent 完成任务', 'agentFx', fxOptions('agent'), theme => fxOf(theme, 'agent'), 'agent'],
      ['打卡完成', 'checkFx', fxOptions('check'), theme => fxOf(theme, 'check'), 'check'],
      ['标记已查看', 'seenFx', seenFxOptions(), seenFxOf, 'seen'],
      ['已查看卡片移动', 'agentMove', MOVES, moveOf, 'move'],
    ];
    for (const [name, key, choices, read, kind] of effects) {
      const row = this.select(panel, name, key, choices, read);
      row.addButton(button => {
        button.setIcon('play').setTooltip(`预览${name}`).onClick(() => this.showPreview(kind, read(this.store.doc.theme)));
        button.buttonEl.setAttribute('aria-label', `预览${name}`);
        this.observe(doc => read(doc.theme), value => button.setDisabled(value === 'none'));
      });
    }
    this.preview = panel.createDiv({ cls: 'todo-lite-effect-preview' });
    this.preview.hidden = true;
  }

  showPreview(kind, effect) {
    this.preview.empty();
    this.preview.hidden = false;
    new Setting(this.preview).setName('动效预览').addButton(button => button.setButtonText('收起').onClick(() => {
      this.preview.empty();
      this.preview.hidden = true;
    }));
    this.plugin.mountEffectPreview(this.preview, kind, effect);
    this.preview.scrollIntoView({ block: 'nearest' });
  }

  places(panel) {
    new Setting(panel).setName('Agent').setHeading();
    this.slider(panel, '多久未查看算超时', 'staleHours', [1, 24, 1], ' 小时', 'settings');
    const list = panel.createDiv();
    this.observe(doc => JSON.stringify(placesByRecency(doc)), () => {
      list.empty();
      for (const place of placesByRecency(this.store.doc)) {
        const lastUse = place.lastUsed ? `，上次使用 ${ago(place.lastUsed)}` : '';
        new Setting(list).setName(place.name).setDesc(`使用 ${place.uses} 次${lastUse}`)
          .addButton(button => button.setButtonText('重命名').onClick(() => this.renamePlace(place.name)))
          .addButton(button => button.setButtonText('移除').onClick(() => this.act.places.remove(place.name)));
      }
    });
    let input;
    const add = async () => {
      const name = input.value.trim();
      if (name && await this.act.places.add(name) && input.value.trim() === name) input.value = '';
    };
    new Setting(panel).setName('添加运行位置')
      .addText(text => {
        input = text.setPlaceholder('例如 本机').inputEl;
        input.setAttribute('aria-label', '新运行位置');
        onEnter(input, add);
      })
      .addButton(button => button.setButtonText('添加').onClick(add));
  }

  renamePlace(from) {
    const dialog = this.openDialog('重命名运行位置');
    let input;
    const rename = async () => {
      const name = input.value.trim();
      if (name && await this.act.places.rename(from, name)) dialog.close();
    };
    new Setting(dialog.contentEl).setName('位置名称').addText(text => {
      input = text.setValue(from).inputEl;
      input.setAttribute('aria-label', '位置名称');
      onEnter(input, rename);
    });
    new Setting(dialog.contentEl)
      .addButton(button => button.setButtonText('取消').onClick(() => dialog.close()))
      .addButton(button => button.setButtonText('重命名').setCta().onClick(rename));
    dialog.open();
    input.select();
  }

  openDialog(title) {
    this.dialog?.close();
    const dialog = new Modal(this.app).setTitle(title);
    dialog.onClose = () => {
      dialog.contentEl.empty();
      if (this.dialog === dialog) this.dialog = null;
    };
    this.dialog = dialog;
    return dialog;
  }

  sections(panel) {
    new Setting(panel).setName('分区').setHeading();
    const list = panel.createDiv();
    const sectionList = doc => sections(doc).map(({ id, title, hidden }) => ({ id, title, hidden }));
    this.observe(doc => JSON.stringify(sectionList(doc)), snapshot => {
      const focusKey = list.ownerDocument.activeElement?.dataset?.todoSectionControl;
      list.empty();
      const entries = JSON.parse(snapshot);
      if (!entries.length) new Setting(list).setDesc('在看板的「编辑布局」里添加分区。');
      for (const [index, section] of entries.entries()) {
        const { id, title, hidden } = section;
        new Setting(list).setName(title).addToggle(toggle => {
          toggle.toggleEl.setAttribute('aria-label', `显示分区 ${title}`);
          toggle.toggleEl.dataset.todoSectionControl = `${id}:visible`;
          toggle.setValue(!hidden).onChange(async visible => {
            if (!await this.act.section(id).patch({ hidden: !visible })) toggle.setValue(!hidden);
          });
        }).addButton(button => {
          button.setIcon('arrow-up').setTooltip('上移').setDisabled(index === 0).onClick(() => this.act.section(id).move('up'));
          button.buttonEl.setAttribute('aria-label', `上移分区 ${title}`);
          button.buttonEl.dataset.todoSectionControl = `${id}:up`;
        }).addButton(button => {
          button.setIcon('arrow-down').setTooltip('下移').setDisabled(index === entries.length - 1).onClick(() => this.act.section(id).move('down'));
          button.buttonEl.setAttribute('aria-label', `下移分区 ${title}`);
          button.buttonEl.dataset.todoSectionControl = `${id}:down`;
        });
      }
      if (focusKey) list.querySelector(`[data-todo-section-control="${CSS.escape(focusKey)}"]`)?.focus({ preventScroll: true });
    });
  }

  customStyle(panel) {
    new Setting(panel).setName('自定义样式').setHeading();
    let field;
    new Setting(panel).setName('看板 CSS').setClass('todo-lite-css-row').addTextArea(text => {
      field = text;
      text.inputEl.setAttribute('aria-label', '看板 CSS');
      text.inputEl.rows = 6;
      text.setPlaceholder('.card { border-width: 2px }');
      this.observe(doc => doc.theme.customCss, value => text.setValue(value));
    });
    new Setting(panel)
      .addButton(button => button.setButtonText('恢复默认外观').onClick(() => this.confirmReset()))
      .addButton(button => button.setButtonText('保存 CSS').setCta().onClick(() => this.act.theme({ customCss: field.getValue() }, 'CSS 已保存')));
  }

  confirmReset() {
    const dialog = this.openDialog('恢复默认外观');
    dialog.setContent('看板主题、布局、头图、动效和自定义 CSS 将恢复默认值。');
    new Setting(dialog.contentEl)
      .addButton(button => button.setButtonText('取消').onClick(() => dialog.close()))
      .addButton(button => button.setButtonText('恢复').setCta().onClick(async () => {
        if (await this.act.theme({ reset: true }, '已恢复默认外观')) dialog.close();
      }));
    dialog.open();
  }
}
