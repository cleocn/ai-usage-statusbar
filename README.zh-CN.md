# AI Usage Status Bar

在 VS Code 状态栏直接显示 **GitHub Copilot、ChatGPT、Cursor** 的用量信息，无需打开浏览器。

![状态栏预览](https://img.shields.io/badge/Copilot-32%2F50-blue?style=flat-square&logo=githubcopilot)

[English](./README.md) | 中文

## 功能特性

- **三家提供商** — GitHub Copilot 配额、ChatGPT 套餐信息、Cursor 本月请求数
- **颜色预警** — Copilot 剩余 ≤ 25% 时状态栏变橙色，≤ 10% 时附加警告图标
- **悬浮详情** — 鼠标悬停显示每家提供商的详细信息
- **自动刷新** — 每 30 分钟在后台自动更新
- **风格切换** — 通过设置在 `minimal`（`32/50`）和 `verbose`（`Copilot 32/50`）之间切换
- **按需开关** — 可独立控制每家提供商的状态栏条目显示与隐藏

## 数据说明

| 提供商 | 数据内容 | 数据来源 |
|--------|---------|---------|
| GitHub Copilot | 高级请求已用 / 总量 | `api.github.com/copilot_internal/user` |
| ChatGPT | 套餐类型（Plus / Pro / Free）+ 续费日期 | `~/.codex/auth.json` JWT |
| Cursor | 本月请求总数 | `api2.cursor.sh/auth/usage` |

> ChatGPT 实时剩余次数无任何 API 可查，仅从 Codex CLI 本地缓存的 JWT 读取套餐信息。

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
| `minimal` | `⊙ 32/50` | `💬 Plus` | `✦ 128` |
| `verbose` | `⊙ Copilot 32/50` | `💬 ChatGPT Plus` | `✦ Cursor 128` |

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
- **ChatGPT**：读取 `~/.codex/auth.json`，解码 JWT 提取套餐类型和订阅日期
- **Cursor**：读取 `state.vscdb`（SQLite）获取 Bearer Token → 请求 `api2.cursor.sh/auth/usage`

## License

MIT
