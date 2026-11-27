# aibased-todolite

[简体中文](README.zh-CN.md)

A lightweight task board for Obsidian desktop. See today's work and overdue tasks, plan deadlines on a monthly calendar, track recurring habits, and organize projects into sections and cards.

The board runs offline inside Obsidian and stores its data in a single JSON file in your vault.

## MCP

The optional local MCP server lets your AI client search, create, and update tasks, track agent progress, and check off habits on the same board. It works even while Obsidian is closed. The configured client can read and write board data, and the plugin and MCP server coordinate writes using a lock in the system's temporary directory.

[Set up MCP and view the tool list](docs/mcp.md) (Chinese).

## Installation

Requires Obsidian desktop 1.15.1 or later. From [GitHub Releases](https://github.com/newkingyeah/todolite/releases/latest), download `main.js`, `manifest.json`, and `styles.css` into `.obsidian/plugins/todo-lite/` in your vault, then enable **aibased-todolite** under Community plugins. Keep `data.json` when upgrading.

## License

[MIT](LICENSE). Based on [Axi404/todo](https://github.com/Axi404/todo), originally created by Axi404. The original copyright and third-party license notices are included in the source and release.
