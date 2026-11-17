# 插件测试记录

验证日期：2026-11-18。

## 环境

- Windows，Node.js 22.17.0。
- 实际 Obsidian 1.14.4，使用单独的测试配置与空测试笔记库。
- Python 3.10 + Playwright 1.65.2，通过本机 CDP 连接该测试实例。

## 已通过

- 首次加载为空看板，任务、分区、卡片、Agent 位置均无初始数据。
- 看板顶部仅有“编辑布局”按钮。
- 通过界面新增分区和任务，编辑标题、备注与截止日期，标记完成。
- 配置每日习惯，打卡、撤销打卡、重新打卡，今日工作中的打卡表同步更新。
- 在 Obsidian 独立设置窗口修改标题、今日工作开关、明暗，保存并立即更新看板。
- 卸载并重新加载插件后，任务状态、打卡、分区布局和外观设置保持。
- 完整刷新 Obsidian 窗口后恢复看板。
- 验收过程中无未捕获 JavaScript 错误。
- 数据测试覆盖并发修改串行保存，以及写入失败和无效编辑后的回滚与恢复。

`npm test`：66 项测试，65 项通过、0 项失败、1 项跳过（原工程的可选私有词检查未配置）。

从锁文件执行 `npm ci` 后在独立仓库目录重新构建并测试通过；相同源代码重复构建的 `main.js` SHA-256 一致。

真实界面脚本：`dev/test-obsidian.py`。

## 重跑真实界面验收

安装插件到一个独立测试笔记库，创建 `.todo-lite-test-vault` 标记文件，并用独立配置启动 Obsidian，开启 `--remote-debugging-port=9229`。关闭这个测试实例后调试端口即停止。

```powershell
$env:TODO_TEST_VAULT = 'C:\path\to\disposable-vault'
$env:TODO_TEST_CDP = 'http://127.0.0.1:9229'
$env:TODO_TEST_SHOTS = 'C:\path\to\test-results'
python dev/test-obsidian.py
```

脚本会核对当前 Obsidian 笔记库路径和标记文件，再清空该测试库内此插件的数据；不要指向日常笔记库。截图和 JSON 结果写入 `TODO_TEST_SHOTS`。

移动端未在真机验收。
