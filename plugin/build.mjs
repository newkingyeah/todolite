import { build } from 'esbuild';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
process.chdir(root);
const frame = await build({ entryPoints: ['plugin/frame.js'], bundle: true, format: 'iife', write: false, minify: true, target: 'es2020' });
let css = await readFile('web/styles.css', 'utf8');
for (const font of [...css.matchAll(/url\("(fonts\/[^\"]+\.woff2)"\)/g)]) {
  const data = await readFile(`web/${font[1]}`);
  css = css.replace(font[0], `url("data:font/woff2;base64,${data.toString('base64')}")`);
}
const script = frame.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
const html = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style><style id="custom-css"></style></head><body><div id="root"></div><!--TODO_CONFIG--><script>${script}</script></body></html>`;
await writeFile('plugin/frame.html', html);
const licenseFiles = [
  "LICENSE",
  "web/vendor/LICENSE-preact",
  "web/vendor/LICENSE-htm",
  "web/fonts/GUST-FONT-LICENSE.txt",
  "web/fonts/LPPL-1.3c.txt",
  "node_modules/proper-lockfile/LICENSE",
  "node_modules/graceful-fs/LICENSE.md",
  "node_modules/retry/License",
  "node_modules/signal-exit/LICENSE.txt"
];
const notices = await Promise.all(licenseFiles.map(async file =>
  file + "\n" + (await readFile(file, "utf8")).trim()
));
await build({
  entryPoints: ['plugin/main.js'], bundle: true, platform: 'node', format: 'cjs', external: ['obsidian'],
  loader: { '.html': 'text' }, outfile: 'main.js', target: 'es2020', minify: true,
  banner: { js: `/*!\n${notices.join('\n\n')}\n*/` },
});
console.log('Built main.js (includes the board, settings and fonts).');
