import { setBackend, actions } from '../web/lib/api.js';
import { html, render, useEffect, useState } from '../web/vendor/preact-htm.js';
import { App } from '../web/components/App.js';
import { Settings } from '../web/components/Settings.js';
import { Ctx } from '../web/components/ctx.js';
import { useDoc } from '../web/components/useDoc.js';
import { applyTheme } from '../web/lib/theme.js';

let sequence = 0;
const pending = new Map();
let connected;
const connection = new Promise(resolve => { connected = resolve; });
const connect = event => {
  if (event.data?.todoConnect !== window.TODO_PLUGIN.token || !event.ports[0]) return;
  window.removeEventListener('message', connect);
  const port = event.ports[0];
  port.onmessage = ({ data }) => {
    if (data?.todoChanged) window.dispatchEvent(new Event('todo-changed'));
    if (data?.todoHostTheme) {
      window.TODO_PLUGIN.hostMode = data.todoHostTheme;
      window.dispatchEvent(new Event('todo-changed'));
    }
    if (!data?.todoResponse) return;
    const request = pending.get(data.id);
    if (!request) return;
    pending.delete(data.id);
    clearTimeout(request.timer);
    data.error ? request.reject(new Error(data.error)) : request.resolve(data.value);
  };
  connected(port);
};
window.addEventListener('message', connect);
setBackend((method, path, body) => new Promise((resolve, reject) => {
  const id = ++sequence;
  const timer = setTimeout(() => { pending.delete(id); reject(new Error('保存请求超时，请重新打开看板')); }, 30000);
  pending.set(id, { resolve, reject, timer });
  connection.then(port => { if (pending.has(id)) port.postMessage({ todoRequest: true, id, method, path, body }); });
}));

function SettingsView() {
  const { doc, err, save, reload } = useDoc(false);
  const [message, setMessage] = useState('');
  useEffect(() => { if (doc) applyTheme(doc.theme); }, [doc]);
  if (!doc) return html`<p>${err || '加载中……'}</p>`;
  const call = async (method, path, body, okMessage) => {
    try { await save(method, path, body); setMessage(okMessage || '已保存'); return true; }
    catch (error) { setMessage(error.message); return false; }
  };
  return html`<${Ctx.Provider} value=${{ doc, act: actions(call), setUi: () => {}, reload }}>
    <${Settings} shown=${true} embedded=${true} />
    <div class="settings-message" role="status">${message}</div>
  <//>`;
}
render(window.TODO_PLUGIN.settings ? html`<${SettingsView} />` : html`<${App} />`, document.getElementById('root'));
