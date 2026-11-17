import { setBackend } from '../web/lib/api.js';
import { html, render } from '../web/vendor/preact-htm.js';
import { App } from '../web/components/App.js';
import { applyTheme } from '../web/lib/theme.js';
import { preview } from '../web/lib/fx/index.js';
import { playSeen } from '../web/lib/fx/seen.js';
import { moveAnimation, reducedMotion } from '../web/lib/motion.js';

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
function startBoard(root) {
  window.addEventListener('message', connect);
  setBackend((method, path, body) => new Promise((resolve, reject) => {
    const id = ++sequence;
    const timer = setTimeout(() => { pending.delete(id); reject(new Error('保存请求超时，请重新打开看板')); }, 30000);
    pending.set(id, { resolve, reject, timer });
    connection.then(port => { if (pending.has(id)) port.postMessage({ todoRequest: true, id, method, path, body }); });
  }));
  render(html`<${App} />`, root);
}

function showPreview(root, { kind, effect }) {
  applyTheme();
  document.body.style.overflow = 'hidden';
  root.style.cssText = 'display:grid;place-items:center;min-height:100vh;padding:1rem 2rem';
  const sample = document.createElement('div');
  sample.className = 'card';
  sample.style.cssText = 'width:min(100%,15rem);text-align:center';
  sample.textContent = reducedMotion() ? '已启用减少动态效果' : '示例卡片';
  root.append(sample);
  if (reducedMotion()) return;
  requestAnimationFrame(() => {
    if (kind === 'move') {
      sample.animate(...moveAnimation(effect, -28, 0).self);
    } else if (kind === 'seen') {
      const rect = sample.getBoundingClientRect();
      playSeen(null, sample, rect.left + rect.width / 2, rect.top + rect.height / 2, effect);
    } else {
      preview(kind, effect, sample, sample);
    }
  });
}

const root = document.getElementById('root');
if (window.TODO_PLUGIN.preview) showPreview(root, window.TODO_PLUGIN.preview);
else startBoard(root);
