import { FileSystemAdapter, Platform, Plugin, ItemView } from 'obsidian';
import { TodoSettingsTab } from './settings.js';
import { BoardStore } from './store.mjs';
import frameHtml from './frame.html';

const VIEW_TYPE = 'todo-lite-board';
const frameDocument = config => frameHtml.replace('<!--TODO_CONFIG-->', () =>
  `<script>window.TODO_PLUGIN=${JSON.stringify(config).replaceAll('<', '\\u003c')}</script>`);

class BoardView extends ItemView {
  constructor(leaf, plugin) { super(leaf); this.plugin = plugin; }
  getViewType() { return VIEW_TYPE; }
  getDisplayText() { return 'AI Based ToDo Lite'; }
  getIcon() { return 'list-todo'; }
  async onOpen() { this.disposeFrame = this.plugin.mountBoard(this.contentEl); }
  async onClose() { this.disposeFrame?.(); }
}

export default class TodoPlugin extends Plugin {
  async onload() {
    this.frames = new Set();
    const changed = doc => {
      this.broadcast({ todoChanged: true });
      this.settingsTab?.refresh(doc);
    };
    const vault = this.app.vault;
    if (Platform.isDesktopApp && vault.adapter instanceof FileSystemAdapter) {
      const { boardFile, openSharedBoard } = await import('./shared-store.mjs');
      const dir = this.manifest.dir || `${vault.configDir}/plugins/${this.manifest.id}`;
      const shared = await openSharedBoard(boardFile(vault.adapter.getBasePath(), dir), changed);
      this.store = shared.store;
      const onError = error => console.warn('[ToDo Lite] 看板同步失败', error);
      try { this.register(shared.watchChanges(onError)); }
      catch (error) { onError(error); }
      this.registerDomEvent(window, 'focus', () => this.store.read().catch(onError));
    } else {
      this.store = new BoardStore(await this.loadData(), doc => this.saveData(doc), changed);
    }
    this.registerView(VIEW_TYPE, leaf => new BoardView(leaf, this));
    this.addRibbonIcon('list-todo', '打开 AI Based ToDo Lite', () => this.openBoard());
    this.addCommand({ id: 'open-board', name: '打开看板', callback: () => this.openBoard() });
    this.settingsTab = new TodoSettingsTab(this.app, this);
    this.addSettingTab(this.settingsTab);
    this.registerEvent(this.app.workspace.on('css-change', () => this.broadcast({ todoHostTheme: this.hostTheme() })));
  }

  hostTheme() { return document.body.classList.contains('theme-dark') ? 'dark' : 'light'; }

  async openBoard() {
    let leaf = this.app.workspace.getLeavesOfType(VIEW_TYPE)[0];
    if (!leaf) {
      leaf = this.app.workspace.getLeaf('tab');
      await leaf.setViewState({ type: VIEW_TYPE, active: true });
    }
    await this.app.workspace.revealLeaf(leaf);
  }

  mountBoard(container) {
    const element = container.createEl('iframe', {
      cls: 'todo-lite-board-frame',
      attr: { title: 'ToDo Lite 看板', sandbox: 'allow-scripts allow-modals allow-popups allow-popups-to-escape-sandbox' },
    });
    const frame = { element, port: null };
    this.frames.add(frame);
    const token = crypto.randomUUID();
    // Only this mounted board receives the port used to edit its data.
    const connect = () => {
      frame.port?.close();
      const channel = new MessageChannel();
      frame.port = channel.port1;
      channel.port1.onmessage = event => this.receive(frame, event.data);
      element.contentWindow.postMessage({ todoConnect: token }, '*', [channel.port2]);
    };
    element.addEventListener('load', connect);
    element.srcdoc = frameDocument({ hostMode: this.hostTheme(), token });
    return () => {
      element.removeEventListener('load', connect);
      frame.port?.close();
      this.frames.delete(frame);
      element.remove();
    };
  }

  mountEffectPreview(container, kind, effect) {
    const frame = container.createEl('iframe', { attr: { title: '动效示例', sandbox: 'allow-scripts' } });
    frame.srcdoc = frameDocument({ hostMode: this.hostTheme(), preview: { kind, effect } });
  }

  broadcast(message) {
    for (const frame of this.frames) {
      if (frame.element.isConnected) frame.port?.postMessage(message);
    }
  }

  async receive(frame, data) {
    if (!data?.todoRequest || !frame.element.isConnected || !this.frames.has(frame)) return;
    const { id, method, path, body } = data;
    if (!Number.isSafeInteger(id) || typeof method !== 'string' || typeof path !== 'string') return;
    const port = frame.port;
    try {
      const value = await this.store.request(method, path, body);
      // Apply the plugin layout to both new and existing boards.
      const theme = { ...value.theme, density: 'comfortable', layout: 'sidebar', agentCols: 3 };
      port.postMessage({ todoResponse: true, id, value: { ...value, theme } });
    } catch (error) {
      port.postMessage({ todoResponse: true, id, error: error.message });
    }
  }

  onunload() {
    this.settingsTab?.hide();
    for (const frame of this.frames) { frame.port?.close(); frame.element.remove(); }
    this.frames.clear();
  }
}
