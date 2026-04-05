# AI Usage Status Bar

A minimal VS Code extension that shows **GitHub Copilot, ChatGPT, and Cursor** usage directly in the status bar — no browser needed.

![Status bar preview](https://img.shields.io/badge/Copilot-32%2F50-blue?style=flat-square&logo=githubcopilot)

English | [中文](./README.zh-CN.md)

## Features

- **3 providers** — GitHub Copilot quota, ChatGPT/Codex quota windows, and Cursor dual-usage percentages
- **Cursor dual usage** — shows both **Auto + Composer remaining %** and **API remaining %** in the status bar
- **Codex dual windows** — shows both **5h remaining %** and **7d remaining %** in the status bar
- **Official codicons** — uses built-in `$(copilot)`, `$(openai)`, and `$(cursor)` icons
- **Unified external format** — all providers display remaining quota first in a compact format
- **Color warnings** — warns on low remaining quota (Copilot / Codex / Cursor)
- **Hover tooltip** — detailed breakdown on hover for each provider
- **Auto-refresh** — updates every 30 minutes in the background
- **Style switching** — toggle between `minimal` (`32/50`) and `verbose` (`Copilot 32/50`) via settings
- **Per-provider toggle** — enable or disable each provider's status bar item independently

## What is tracked

| Provider | Metric | Source |
|----------|--------|--------|
| GitHub Copilot | Premium interactions remaining / total + remaining % | `api.github.com/copilot_internal/user` |
| ChatGPT / Codex | Plan type + renewal date + **5h/7d usage windows** | `~/.codex/auth.json` JWT + `~/.codex/logs_1.sqlite` response headers |
| Cursor | **Auto + Composer remaining %** and **API remaining %** (current billing cycle) | `api2.cursor.sh/aiserver.v1.DashboardService/GetCurrentPeriodUsage` |

> Codex window usage is extracted from local Codex logs (latest API response headers), so it appears after you use Codex at least once.

## Installation

### From source (development)

1. Clone this repo
2. Open VS Code
3. Press `Cmd+Shift+P` → **Extensions: Install from Location**
4. Select the cloned folder

### From VSIX (once published)

```
code --install-extension ai-usage-statusbar-1.0.0.vsix
```

## Requirements

- VS Code 1.74+
- GitHub account signed in to VS Code with Copilot enabled
- [OpenAI Codex CLI](https://github.com/openai/codex) installed and signed in (for ChatGPT info)
- [Cursor](https://cursor.sh) installed and signed in (for Cursor info)

## Platform Support

| Provider | macOS | Windows | Linux |
|----------|-------|---------|-------|
| GitHub Copilot | ✅ | ✅ | ✅ |
| ChatGPT / Codex | ✅ | ✅ | ✅ |
| Cursor | ✅ | ✅ | ✅ |

Cursor's `state.vscdb` is resolved per platform automatically:
- **macOS**: `~/Library/Application Support/Cursor/User/globalStorage/state.vscdb`
- **Windows**: `%APPDATA%/Cursor/User/globalStorage/state.vscdb`
- **Linux**: `~/.config/Cursor/User/globalStorage/state.vscdb`

Codex paths (`~/.codex/`) and Copilot API calls are cross-platform by default.

## Settings

Search **"AI Usage"** in VS Code Settings, or edit `settings.json` directly:

```jsonc
{
  // "minimal" (default): icon + numbers only
  // "verbose": include provider name
  "aiUsage.style": "minimal",

  // Toggle each provider's status bar item
  "aiUsage.providers.copilot": true,
  "aiUsage.providers.chatgpt": true,
  "aiUsage.providers.cursor": true
}
```

**Style examples:**

| Style | Copilot | ChatGPT | Cursor |
|-------|---------|---------|--------|
| `minimal` | `$(copilot) 32/50 64%` | `$(openai) 5h90% 7d54%` | `$(cursor) AUTO21% API0%` |
| `verbose` | `$(copilot) Copilot 32/50 64%` | `$(openai) Codex 5h90% 7d54%` | `$(cursor) Cursor AUTO21% API0%` |

Settings take effect immediately without reloading.

## Commands

| Command | Description |
|---------|-------------|
| `Copilot Usage: Refresh` | Manually refresh Copilot usage |
| `Copilot Usage: Sign in to GitHub` | Trigger GitHub sign-in |
| `AI Usage: Open ChatGPT Usage Page` | Open chatgpt.com usage settings |
| `AI Usage: Refresh Cursor Usage` | Manually refresh Cursor usage |

## How it works

- **Copilot**: calls `vscode.authentication.getSession('github', ['read:user'])` → queries `api.github.com/copilot_internal/user` (undocumented internal endpoint, may change)
- **ChatGPT/Codex**: reads `~/.codex/auth.json` for plan/subscription and `~/.codex/logs_1.sqlite` for `x-codex-*` usage headers
- **Cursor**: reads `state.vscdb` (SQLite) for the Bearer token → queries `api2.cursor.sh/aiserver.v1.DashboardService/GetCurrentPeriodUsage` for Auto/API percentages (falls back to `auth/usage` when needed)

## License

MIT
