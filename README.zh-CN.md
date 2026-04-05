# AI Usage Status Bar

在 VS Code 状态栏直接显示 **GitHub Copilot、ChatGPT、Cursor** 的用量信息，无需打开浏览器。

![状态栏预览](https://img.shields.io/badge/Copilot-32%2F50-blue?style=flat-square&logo=githubcopilot)

[English](./README.md) | 中文

## 功能特性

- **三家提供商** — GitHub Copilot 配额、ChatGPT/Codex 双窗口用量、Cursor 双额度用量
- **Cursor 双额度** — 状态栏同时显示 **Auto + Composer 剩余百分比** 与 **API 剩余百分比**
- **Codex 双窗口** — 状态栏同时显示 **5h 剩余百分比** 和 **7d 剩余百分比**
- **官方 codicon 图标** — 使用内置 `$(copilot)`、`$(openai)`、`$(cursor)`
- **统一外显规范** — 所有提供商都优先显示余量信息，状态栏格式保持一致
- **颜色预警** — Copilot 剩余 ≤ 25% 时状态栏变橙色，≤ 10% 时附加警告图标
- **悬浮详情** — 鼠标悬停显示每家提供商的详细信息
- **自动刷新** — 每 30 分钟在后台自动更新
- **风格切换** — 通过设置在 `minimal`（`32/50`）和 `verbose`（`Copilot 32/50`）之间切换
- **按需开关** — 可独立控制每家提供商的状态栏条目显示与隐藏

## 数据说明

| 提供商 | 数据内容 | 数据来源 |
|--------|---------|---------|
| GitHub Copilot | 高级请求剩余 / 总量 + 剩余百分比 | `api.github.com/copilot_internal/user` |
| ChatGPT / Codex | 套餐类型 + 续费日期 + **5h/7d 用量窗口** | `~/.codex/auth.json` JWT + `~/.codex/logs_1.sqlite` 响应头 |
| Cursor | 当前计费周期 **Auto + Composer 剩余 %** 与 **API 剩余 %** | `api2.cursor.sh/aiserver.v1.DashboardService/GetCurrentPeriodUsage` |

> Codex 窗口用量来自本地 Codex 日志中的最近一次 API 响应头，因此至少先使用一次 Codex 才会出现数据。

## 安装

### 从源码安装（开发者方式）

1. 克隆本仓库
2. 打开 VS Code
3. 按 `Cmd+Shift+P`，输入 **Extensions: Install from Location**
4. 选择克隆后的文件夹

### 从 VSIX 安装（发布后）

```
code --install-extension ai-usage-statusbar-1.0.0.vsix
```

## 环境要求

- VS Code 1.74+
- 已在 VS Code 中登录 GitHub 账号并开启 Copilot
- 安装并登录 [OpenAI Codex CLI](https://github.com/openai/codex)（ChatGPT 信息需要）
- 安装并登录 [Cursor](https://cursor.sh)（Cursor 信息需要）

## 平台支持

| 提供商 | macOS | Windows | Linux |
|--------|-------|---------|-------|
| GitHub Copilot | ✅ | ✅ | ✅ |
| ChatGPT / Codex | ✅ | ✅ | ✅ |
| Cursor | ✅ | ✅ | ✅ |

Cursor 的 `state.vscdb` 路径按平台自动解析：
- **macOS**：`~/Library/Application Support/Cursor/User/globalStorage/state.vscdb`
- **Windows**：`%APPDATA%/Cursor/User/globalStorage/state.vscdb`
- **Linux**：`~/.config/Cursor/User/globalStorage/state.vscdb`

Codex 路径（`~/.codex/`）和 Copilot API 调用默认即跨平台兼容。

## 设置项

在 VS Code 设置中搜索 **"AI Usage"**，或直接编辑 `settings.json`：

```jsonc
{
  // "minimal"（默认）：只显示图标和数字
  // "verbose"：同时显示提供商名称
  "aiUsage.style": "minimal",

  // 控制每家提供商的状态栏条目
  "aiUsage.providers.copilot": true,
  "aiUsage.providers.chatgpt": true,
  "aiUsage.providers.cursor": true
}
```

**风格对比：**

| 风格 | Copilot | ChatGPT | Cursor |
|------|---------|---------|--------|
| `minimal` | `$(copilot) 32/50 64%` | `$(openai) 5h90% 7d54%` | `$(cursor) AUTO21% API0%` |
| `verbose` | `$(copilot) Copilot 32/50 64%` | `$(openai) Codex 5h90% 7d54%` | `$(cursor) Cursor AUTO21% API0%` |

设置修改后立即生效，无需重新加载。

## 命令

| 命令 | 说明 |
|------|------|
| `Copilot Usage: Refresh` | 手动刷新 Copilot 用量 |
| `Copilot Usage: Sign in to GitHub` | 触发 GitHub 登录流程 |
| `AI Usage: Open ChatGPT Usage Page` | 打开 chatgpt.com 用量设置页 |
| `AI Usage: Refresh Cursor Usage` | 手动刷新 Cursor 用量 |

## 工作原理

- **Copilot**：调用 `vscode.authentication.getSession('github', ['read:user'])` 获取 Token → 请求 `api.github.com/copilot_internal/user`（未文档化内部接口，可能随时变更）
- **ChatGPT/Codex**：读取 `~/.codex/auth.json` 获取套餐/续费信息，再从 `~/.codex/logs_1.sqlite` 的 `x-codex-*` 响应头提取窗口用量
- **Cursor**：读取 `state.vscdb`（SQLite）获取 Bearer Token → 请求 `api2.cursor.sh/aiserver.v1.DashboardService/GetCurrentPeriodUsage` 获取 Auto/API 百分比（必要时回退 `auth/usage`）

## License

MIT
