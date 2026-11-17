import { mkdir, copyFile } from 'node:fs/promises';
await mkdir('dist/todo-lite', { recursive: true });
for (const name of ['main.js', 'manifest.json', 'styles.css']) await copyFile(name, `dist/todo-lite/${name}`);
await copyFile('LICENSE', 'dist/todo-lite/LICENSE');
await mkdir('dist/todo-lite/licenses', { recursive: true });
for (const [source, name] of [
  ['web/vendor/LICENSE-preact', 'LICENSE-preact'],
  ['web/vendor/LICENSE-htm', 'LICENSE-htm'],
  ['web/fonts/GUST-FONT-LICENSE.txt', 'GUST-FONT-LICENSE.txt'],
  ['web/fonts/LPPL-1.3c.txt', 'LPPL-1.3c.txt'],
]) await copyFile(source, `dist/todo-lite/licenses/${name}`);
console.log('Plugin installation files: dist/todo-lite/');
