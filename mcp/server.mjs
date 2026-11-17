import { readFile } from 'node:fs/promises';
import { isAbsolute, join, normalize, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { boardFile, openSharedBoard } from '../plugin/shared-store.mjs';
import { registerTools } from './tools.mjs';

async function main() {
  const { values } = parseArgs({ options: { vault: { type: 'string' }, 'config-dir': { type: 'string' }, help: { type: 'boolean' } } });
  if (values.help) {
    console.log('Usage: node mcp/server.mjs --vault <Obsidian vault path> [--config-dir .obsidian]');
    return;
  }
  const vault = values.vault ?? process.env.TODOLITE_VAULT;
  if (!vault?.trim()) throw new Error('请用 --vault 或 TODOLITE_VAULT 指定 Obsidian 笔记库路径。');
  const config = normalize(values['config-dir'] ?? process.env.TODOLITE_CONFIG_DIR ?? '.obsidian');
  if (isAbsolute(config) || config === '.' || config.split(/[\\/]/).includes('..') || config.includes(':')) {
    throw new Error('--config-dir 需要是笔记库内的相对目录。');
  }
  const root = resolve(vault);
  const pluginDir = join(config, 'plugins', 'todo-lite');
  const manifestFile = join(root, pluginDir, 'manifest.json');
  const installed = await readFile(manifestFile, 'utf8').catch(error => {
    if (error.code !== 'ENOENT') throw error;
    throw new Error('此笔记库未安装 ToDo Lite。请确认笔记库路径和配置目录。');
  });
  const manifest = JSON.parse(installed.replace(/^\uFEFF/, ''));
  const [major, minor] = String(manifest.version).split('.').map(Number);
  if (manifest.id !== 'todo-lite' || !(major > 1 || (major === 1 && minor >= 1))) {
    throw new Error('请先更新此笔记库里的 ToDo Lite 到 1.1.0 或以上。');
  }
  const { store } = await openSharedBoard(boardFile(root, pluginDir));
  const version = JSON.parse(await readFile(new URL('../manifest.json', import.meta.url), 'utf8')).version;
  const server = new McpServer({ name: 'todolite-mcp-server', version }, {
    instructions: '操作当前配置的 ToDo Lite 看板。用查询返回的 ID 定位卡片和任务。日期使用本机时区，习惯按照单独的刷新时间打卡。',
  });
  registerTools(server, store);
  await server.connect(new StdioServerTransport());
}

main().catch(error => {
  console.error(`[ToDo Lite MCP] ${error.message}`);
  process.exitCode = 1;
});
