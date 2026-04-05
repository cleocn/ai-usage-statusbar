# AI Usage Status Bar

A minimal VS Code extension that shows **GitHub Copilot, ChatGPT, and Cursor** usage directly in the status bar — no browser needed.

![Status bar preview](https://img.shields.io/badge/Copilot-32%2F50-blue?style=flat-square&logo=githubcopilot)

English | [中文](./README.zh-CN.md)

## Features

- **3 providers** — GitHub Copilot quota, ChatGPT plan info, and Cursor monthly request count
- **Color warnings** — status bar turns orange when Copilot quota ≤ 25% remaining
- **Hover tooltip** — detailed breakdown on hover for each provider
- **Auto-refresh** — updates every 30 minutes in the background
- **Style switching** — toggle between `minimal` (`32/50`) and `verbose` (`Copilot 32/50`) via settings
- **Per-provider toggle** — enable or disable each provider's status bar item independently

## What is tracked

| Provider | Metric | Source |
|----------|--------|--------|
| GitHub Copilot | Premium interactions used / total | `api.github.com/copilot_internal/user` |
| ChatGPT | Plan type (Plus / Pro / Free) + renewal date | `~/.codex/auth.json` JWT |
| Cursor | Monthly request count | `api2.cursor.sh/auth/usage` |

> ChatGPT real-time remaining count is not available via any API. Plan info is read locally from the Codex CLI auth file.

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
| `minimal` | `⊙ 32/50` | `💬 Plus` | `✦ 128` |
| `verbose` | `⊙ Copilot 32/50` | `💬 ChatGPT Plus` | `✦ Cursor 128` |

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
- **ChatGPT**: reads `~/.codex/auth.json`, decodes the JWT to extract plan type and subscription date
- **Cursor**: reads `state.vscdb` (SQLite) for the Bearer token → queries `api2.cursor.sh/auth/usage`

## License

MIT
