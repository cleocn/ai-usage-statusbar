# Copilot Usage Status Bar

在 VS Code 状态栏直接显示 **GitHub Copilot 高级请求用量**，无需打开浏览器。

![状态栏预览](https://img.shields.io/badge/Copilot-32%2F50-blue?style=flat-square&logo=githubcopilot)

[English](./README.md) | 中文

## 功能特性

- **实时用量显示** — 状态栏展示已用 / 总量（如 `⊙ Copilot: 32/50`）
- **颜色预警** — 剩余 ≤ 25% 时状态栏变橙色，≤ 10% 时附加警告图标
- **悬浮详情** — 鼠标悬停显示已用量、剩余量、重置日期
- **自动刷新** — 每 30 分钟在后台自动更新
- **点击刷新** — 点击状态栏条目可立即刷新
- **无限制套餐支持** — Pro / Business / Enterprise 套餐显示 `Copilot Pro · 无限制`

## 数据说明

| 指标 | 是否支持 |
|------|---------|
| 高级请求次数（GPT-4o、Claude 等） | ✅ |
| 配额重置日期 | ✅ |
| 代码补全次数（Free 套餐 2000 次/月） | ❌ GitHub 未提供查询接口 |

> GitHub Copilot **免费套餐**每月包含 **50 次高级请求**。普通代码补全使用基础模型，不计入此配额，GitHub 也未提供相关 API。

## 安装

### 从源码安装（开发者方式）

1. 克隆本仓库
2. 打开 VS Code
3. 按 `Cmd+Shift+P`，输入 **Extensions: Install from Location**
4. 选择克隆后的文件夹

### 从 VSIX 安装（发布后）

```
code --install-extension copilot-usage-statusbar-1.0.0.vsix
```

## 环境要求

- VS Code 1.74+
- 已在 VS Code 中登录 GitHub 账号并开启 Copilot

首次启动时扩展会弹出 GitHub OAuth 授权请求（使用 VS Code 内置 GitHub 认证流程，无需填写任何额外 Token）。

## 工作原理

1. 调用 `vscode.authentication.getSession('github', ['read:user'])` 通过 VS Code 内置认证获取 GitHub OAuth Token
2. 请求内部接口 `GET https://api.github.com/copilot_internal/user`
3. 读取响应中的 `quota_snapshots.premium_interactions` 字段
4. 将结果渲染到状态栏

> **注意：** `copilot_internal/user` 是 GitHub 内部未文档化的接口，可能随时变更。若接口失效，状态栏会显示"获取失败"，点击可重试。

## 命令

| 命令 | 说明 |
|------|------|
| `Copilot Usage: Refresh` | 手动刷新用量数据 |
| `Copilot Usage: Sign in to GitHub` | 触发 GitHub 登录流程 |

## License

MIT
