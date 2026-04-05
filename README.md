# AI Usage Status Bar

A minimal VS Code extension that shows your **GitHub Copilot premium request usage** directly in the status bar — no browser needed.

![Status bar preview](https://img.shields.io/badge/Copilot-32%2F50-blue?style=flat-square&logo=githubcopilot)

English | [中文](./README.zh-CN.md)

## Features

- **Real-time quota display** — shows used / total premium interactions (e.g. `⊙ Copilot: 32/50`)
- **Color warnings** — status bar turns orange when ≤ 25% remaining, with a warning icon at ≤ 10%
- **Hover tooltip** — shows detailed breakdown: used, remaining, reset date
- **Auto-refresh** — updates every 30 minutes in the background
- **Click to refresh** — click the status bar item to refresh on demand
- **Unlimited plan support** — displays `Copilot Pro · 无限制` for paid plans with no cap

## What is tracked

| Metric | Tracked |
|--------|---------|
| Premium interactions (GPT-4o, Claude, etc.) | ✅ |
| Reset date | ✅ |
| Code completions (2000/month on Free) | ❌ GitHub does not expose this via API |

> GitHub Copilot Free includes **50 premium interactions/month**. Basic code completions use a lighter model and are not counted against this quota — GitHub does not provide an API to query them.

## Installation

### From source (development)

1. Clone this repo
2. Open VS Code
3. Press `Cmd+Shift+P` → **Extensions: Install from Location**
4. Select the cloned folder

### From VSIX (once published)

```
code --install-extension copilot-usage-statusbar-1.0.0.vsix
```

## Requirements

- VS Code 1.74+
- GitHub account signed in to VS Code with Copilot enabled

On first launch the extension will prompt a GitHub OAuth sign-in (standard VS Code GitHub auth flow — no extra tokens or credentials required).

## How it works

1. Calls `vscode.authentication.getSession('github', ['read:user'])` to obtain a GitHub OAuth token via VS Code's built-in auth provider
2. Queries the internal GitHub endpoint `GET https://api.github.com/copilot_internal/user`
3. Reads `quota_snapshots.premium_interactions` from the response
4. Renders the result in the status bar

> **Note:** `copilot_internal/user` is an undocumented internal endpoint used by GitHub's own tooling. It may change without notice. If it does, the status bar will show "获取失败" and clicking it will retry.

## Commands

| Command | Description |
|---------|-------------|
| `Copilot Usage: Refresh` | Manually refresh usage data |
| `Copilot Usage: Sign in to GitHub` | Trigger GitHub sign-in |

## License

MIT
