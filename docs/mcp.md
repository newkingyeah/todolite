# ToDo Lite MCP

本地 Agent 和 Obsidian 桌面插件共用同一个看板。Obsidian 关闭时，客户端仍可启动 MCP 读写看板。再次打开 Obsidian 会读到最新内容。应用开着时，看板也会自动刷新。

## 接入

1. 在目标笔记库安装或升级 ToDo Lite 1.1.0 及以上版本。
2. 在 todolite 仓库目录运行 `npm ci`。需要 Node.js 22.13 或以上。
3. 在 MCP 客户端添加本地 stdio 服务。将下面的路径换成仓库和笔记库的绝对路径。

```json
{
  "mcpServers": {
    "todolite": {
      "command": "node",
      "args": ["/path/to/todolite/mcp/server.mjs", "--vault", "/path/to/vault"]
    }
  }
}
```

使用 Codex CLI 时，传入同一组参数。

```sh
codex mcp add todolite -- node "/path/to/todolite/mcp/server.mjs" --vault "/path/to/vault"
```

Windows 命令中的路径用双引号包住。填到 JSON 时可用 `E:/...` 或转义后的反斜杠。笔记库使用自定义 Obsidian 配置文件夹时，追加 `--config-dir .obsidian-custom`。

## 可以做什么

| 操作 | 工具 |
| --- | --- |
| 查今日工作、历史和详情 | `todolite_get_today`、`todolite_search_tasks`、`todolite_get_task` |
| 查分区和卡片 | `todolite_list_sections`、`todolite_list_cards` |
| 建卡片、建任务、修改、完成和重开 | `todolite_create_card`、`todolite_create_task`、`todolite_update_task` |
| 删除任务、习惯、卡片和分区 | `todolite_delete_task`、`todolite_delete_card`、`todolite_delete_section` |
| 交接任务、汇报进展和结果 | `todolite_assign_agent`、`todolite_report_agent` |
| 打卡、补打和撤销习惯打卡 | `todolite_check_habit` |

例如，可以让 Agent “把今天逾期的任务列出来”“在工作卡里加一条本周五截止的待办”“把这项任务标成 Agent 在做，完成后把报告路径写到结果里”，或“补打昨天的每日阅读”。

搜索已完成任务时可加日期范围。写入任务请使用查询返回的任务或卡片 ID。`todolite_report_agent` 的 `finish: true` 会在提交结果时一并完成任务。习惯的默认打卡日以各自设置的刷新时间为准。

删除时使用查询返回的 ID。比如「删掉历史里那条已完成的测试任务」会先查询历史，再调用删除工具。删除习惯会一并删除打卡记录。删除还有任务的卡片或分区时，`force: true` 表示连同里面的任务一起删除。

MCP 通过本机 stdio 连接，每次配置指向一个笔记库。同一台电脑上的 MCP 与桌面插件写入时共用文件锁。跨设备同步和冲突处理由你使用的笔记库同步工具负责。
