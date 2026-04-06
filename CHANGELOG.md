# Changelog

All notable changes to this project will be documented in this file.

The format is based on Keep a Changelog, and this project follows Semantic Versioning.

## [1.0.2] - 2026-04-07

### Changed
- Status bar now shows a reset countdown prefix (`Xd`) right after each provider icon.
- ChatGPT/Codex countdown prefix now uses subscription renewal date instead of window reset date.
- ChatGPT/Codex status bar window labels now show remaining-to-reset time (for example `3h`, `6d`) rather than fixed `5h`/`7d` text.
- Removed `OD`, `AUTO`, and `API` labels from compact status bar text to save space.
- Copilot no longer shows `OD 0` in status bar/tooltip when there is no overage.
- Cursor status bar keeps OD numeric value when available, but without the `OD` text label.
- Updated English and Chinese documentation to match current status bar behavior.

## [1.0.0] - 2026-04-05

### Added
- Initial release of AI Usage Status Bar extension.
- Status bar usage display for GitHub Copilot.
- Status bar usage display for ChatGPT/Codex (5h and 7d windows).
- Status bar usage display for Cursor (AUTO and API remaining percentages).
- Per-provider visibility toggles.
- Minimal and verbose display styles.
- Hover tooltips with detailed quota information.
- Auto-refresh every 30 minutes.

### Changed
- Unified status bar display to prioritize remaining percentage across all providers.
- Updated documentation in English and Chinese.
