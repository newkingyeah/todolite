# aibased-todolite

[English](README.md)

轻量的 Obsidian 桌面待办看板。查看今日和逾期任务，在月历里安排截止日期，记录习惯打卡，用分区和卡片整理项目。

看板直接在 Obsidian 中离线运行，数据保存在笔记库内的一个 JSON 文件里。

## MCP

可选的本机 MCP 服务让 AI 客户端查询、新建和更新同一个看板上的任务，回写 Agent 进度，以及完成习惯打卡。关闭 Obsidian 后也可使用。配置的客户端可以读写看板数据，插件和 MCP 服务通过系统临时目录中的文件锁协调写入。

[配置 MCP 与查看工具列表](docs/mcp.md)。

## 安装

需要 Obsidian 桌面版 1.15.1 或更高版本。从 [GitHub Releases](https://github.com/newkingyeah/todolite/releases/latest) 下载 `main.js`、`manifest.json` 和 `styles.css`，放到笔记库中的 `.obsidian/plugins/todo-lite/`，再到第三方插件设置启用 **aibased-todolite**。升级时保留 `data.json`。

## 许可证

[MIT](LICENSE)。基于 Axi404 创建的 [Axi404/todo](https://github.com/Axi404/todo)。源码和发布文件附带原项目的版权声明与第三方许可证。
