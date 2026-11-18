# ToDo Lite · Obsidian 插件

**ToDo Lite** 是一个 Obsidian 待办插件，可以在笔记库里管理任务、查看截止日期和记录习惯打卡。

- 看板按 **今日工作 → 日历 → 分区** 排列。点击顶部的 **编辑布局** 可以新增和调整分区、卡片。
- 设置统一放在 **Obsidian → 设置 → ToDo Lite**，修改后立即保存并更新看板。
- 首次启用是空看板，不含演示任务，不读取原工程的 SQLite 数据。
- 插件可直接使用。任务、打卡、布局和外观设置保存在当前笔记库的 `.obsidian/plugins/todo-lite/data.json`。
- 支持任务状态、截止日期、重复打卡、今日工作和月历；保留原来的头图与特效。

## 安装

1. 从本仓库下载 [main.js](main.js)、[manifest.json](manifest.json) 和 [styles.css](styles.css)。
2. 在笔记库内创建 `.obsidian/plugins/todo-lite/`，把三个文件放入这个目录。
3. 在 Obsidian 的第三方插件设置中启用 **ToDo Lite**。
4. 点击左侧待办图标，或用命令面板执行 **ToDo Lite: 打开看板**。
5. 点击 **编辑布局 → ＋ 加一块新的分区**，开始建立自己的看板。

升级时只替换以上三个文件，保留 `data.json`。首次安装不需要创建 `data.json`。

## Agent 接入（MCP）

ToDo Lite 通过 MCP 提供 **14 个 Agent 可调用的工具**，每个工具都有明确的参数和返回格式。比如你说「在工作卡里加一条周五截止的待办」，Agent 会先用 `todolite_list_cards` 找到卡片 ID，再用 `todolite_create_task` 写入任务。工具还可以查今日任务和历史，修改、完成或重开任务，删除任务、卡片或分区，交接任务并回写进度与结果，以及打卡、补打和撤销。

MCP 服务由客户端在本机通过 Node.js 启动，和 Obsidian 插件读写同一份看板数据。**Obsidian 关闭时，Agent 也能操作看板**，重新打开就能看到更新。

### 复制给 Agent，自动安装和配置

把下面整段发给能访问本机文件和终端、支持本地 MCP 的 Agent。

```text
请帮我在本机安装 ToDo Lite Obsidian 插件，并在当前 Agent 客户端配置 todolite MCP。请直接完成安装和验证。

1. 从 https://github.com/newkingyeah/todolite 下载完整仓库到固定的本地目录。准备 Node.js 22.13 或更高版本，在仓库目录执行 npm ci。
2. 确认我要使用的 Obsidian 笔记库。能从本机配置确定就直接使用，无法确定时再问我。把仓库根目录的 main.js、manifest.json、styles.css 放到该库配置目录下的 plugins/todo-lite/，通常是 .obsidian/plugins/todo-lite/。启用 ToDo Lite，升级时保留已有 data.json。如果旧版插件正在运行，请重载插件。
3. 在当前客户端添加名为 todolite 的本地 stdio MCP 服务。用 Node.js 启动仓库中的 mcp/server.mjs，传入 --vault 和笔记库的绝对路径。脚本也使用绝对路径。若使用自定义 Obsidian 配置目录，再传 --config-dir 和该目录在笔记库内的相对路径。
4. 通过 MCP 调用 todolite_list_cards 做只读连通验证。如果当前客户端需要重启才能加载配置，先验证本地服务能连接，再告诉我如何让配置生效。最后报告笔记库、插件版本和验证结果。
```

手动配置和完整工具列表见 [ToDo Lite MCP 文档](docs/mcp.md)。

## 设置

打开 **设置 → ToDo Lite**。设置使用 Obsidian 原生控件，可调整看板外观、布局、头图、动效、Agent 运行位置和分区。标题等文本按回车或离开输入框时保存。自定义 CSS 通过 **保存 CSS** 生效。

设置页始终跟随 Obsidian 的主题。看板可独立选择浅色、深色或跟随 Obsidian。

Canvas LMS 的服务端同步不在插件内运行；原服务端工具仍保留，使用方式见 [原网页服务文档](docs/server.md)。

## 开发与测试

构建需要 Node.js 22.13 或以上版本。

```sh
npm ci
npm run build
npm test
npm run package
```

`npm run build` 生成根目录的 `main.js`；字体、前端和样式内嵌其中。`npm run package` 将三个安装文件放到 `dist/todo-lite/`。构建不包含 `data/`、测试数据或 `demo/sample.js`。

`test/plugin.test.mjs` 验证插件空数据、保存与重新加载、并发操作、错误回滚。`test/mcp.test.mjs` 用 MCP 客户端验证四类操作和同机并发写入。

真实 Obsidian 验收使用 `dev/test-obsidian.py`，只允许操作带有 `.todo-lite-test-vault` 标记的独立测试库，需要 Python 3.10+ 和 Playwright。详见 [测试记录](docs/testing.md)。

## 代码结构

- `plugin/main.js`：Obsidian 视图、设置页、生命周期和视图间通信。
- `plugin/store.mjs`、`plugin/shared-store.mjs`：串行处理修改，负责桌面端与 MCP 的共用文件读写。
- `mcp/`：本地 MCP stdio 服务。
- `plugin/frame.js`：连接原前端与插件存储；看板和设置各自隔离样式。
- `web/`、`core/`：当前 todo-lite 的前端与任务逻辑。
- `server/`、`canvas/`、`client.mjs`：保留的原网页服务工具。

## 许可证

[MIT](LICENSE)。基于 [Axi404/todo](https://github.com/Axi404/todo) 的 todo-lite 版本改造，保留原作者版权声明。Preact、htm 与字体的许可证随源代码保留。
