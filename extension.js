// copilot-usage-statusbar/extension.js
const vscode = require("vscode");

const COPILOT_USAGE_URL = "https://api.github.com/copilot_internal/user";
const REFRESH_INTERVAL_MS = 30 * 60 * 1000; // 30 minutes

let statusBarItem;
let refreshTimer;

async function activate(context) {
  // Create status bar item (left side, low priority so it doesn't crowd)
  statusBarItem = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Left,
    50
  );
  statusBarItem.command = "copilotUsage.refresh";
  statusBarItem.tooltip = "GitHub Copilot 用量 · 点击刷新";
  statusBarItem.show();
  context.subscriptions.push(statusBarItem);

  // Register commands
  context.subscriptions.push(
    vscode.commands.registerCommand("copilotUsage.refresh", () => {
      fetchAndRender(true);
    }),
    vscode.commands.registerCommand("copilotUsage.signIn", () => {
      fetchAndRender(true);
    })
  );

  // Initial fetch
  await fetchAndRender(false);

  // Periodic refresh
  refreshTimer = setInterval(() => fetchAndRender(false), REFRESH_INTERVAL_MS);
  context.subscriptions.push({ dispose: () => clearInterval(refreshTimer) });
}

async function getGitHubToken(interactive) {
  try {
    const session = await vscode.authentication.getSession(
      "github",
      ["read:user"],
      { createIfNone: interactive, silent: !interactive }
    );
    return session?.accessToken ?? null;
  } catch {
    return null;
  }
}

async function fetchCopilotUsage(token) {
  const res = await fetch(COPILOT_USAGE_URL, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
      "User-Agent": "vscode-copilot-usage-statusbar/1.0",
    },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

function fmtResetDate(dateStr) {
  if (!dateStr) return "";
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString("zh-CN", { month: "short", day: "numeric" });
  } catch {
    return dateStr;
  }
}

async function fetchAndRender(interactive) {
  statusBarItem.text = "$(sync~spin) Copilot";
  statusBarItem.backgroundColor = undefined;

  const token = await getGitHubToken(interactive);
  if (!token) {
    statusBarItem.text = "$(github) Copilot: 未登录";
    statusBarItem.tooltip =
      "点击登录 GitHub 以显示 Copilot 用量\n(运行命令: Copilot Usage: Sign in to GitHub)";
    statusBarItem.command = "copilotUsage.signIn";
    return;
  }

  try {
    const data = await fetchCopilotUsage(token);
    renderUsage(data);
    statusBarItem.command = "copilotUsage.refresh";
  } catch (e) {
    statusBarItem.text = "$(warning) Copilot: 获取失败";
    statusBarItem.tooltip = `错误: ${e.message}\n点击重试`;
    statusBarItem.backgroundColor = new vscode.ThemeColor(
      "statusBarItem.warningBackground"
    );
    statusBarItem.command = "copilotUsage.refresh";
  }
}

function renderUsage(data) {
  const plan = data.copilot_plan ?? "unknown";
  const resetDate = fmtResetDate(data.quota_reset_date);
  const snap = data.quota_snapshots?.premium_interactions;

  if (!snap) {
    // Paid plan with unlimited premium interactions
    const planLabel =
      plan === "individual_pro" || plan === "individual"
        ? "Pro"
        : plan === "business"
        ? "Business"
        : plan === "enterprise"
        ? "Enterprise"
        : plan;
    statusBarItem.text = `$(copilot) Copilot ${planLabel} · 无限制`;
    statusBarItem.tooltip = `GitHub Copilot ${planLabel}\n不限高级请求`;
    statusBarItem.backgroundColor = undefined;
    return;
  }

  const { entitlement, percent_remaining, unlimited, overage_count } = snap;
  if (unlimited) {
    statusBarItem.text = `$(copilot) Copilot · 无限制`;
    statusBarItem.tooltip = `高级请求: 无上限`;
    statusBarItem.backgroundColor = undefined;
    return;
  }

  const used = Math.round(entitlement * (1 - percent_remaining / 100));
  const remaining = entitlement - used;
  const pct = Math.round(percent_remaining);
  const overageStr = overage_count > 0 ? ` +${overage_count}超出` : "";

  // Status icon based on remaining %
  let icon = "$(copilot)";
  let bgColor = undefined;
  if (pct <= 10) {
    icon = "$(warning)";
    bgColor = new vscode.ThemeColor("statusBarItem.warningBackground");
  } else if (pct <= 25) {
    icon = "$(copilot)";
    bgColor = new vscode.ThemeColor("statusBarItem.warningBackground");
  }

  statusBarItem.text = `${icon} Copilot: ${remaining}/${entitlement}${overageStr}`;
  statusBarItem.tooltip = [
    `GitHub Copilot 高级请求`,
    `已用: ${used} / ${entitlement}`,
    `剩余: ${remaining} (${pct}%)`,
    resetDate ? `重置日期: ${resetDate}` : "",
    overage_count > 0 ? `超额使用: ${overage_count} 次` : "",
    ``,
    `点击刷新`,
  ]
    .filter(Boolean)
    .join("\n");
  statusBarItem.backgroundColor = bgColor;
}

function deactivate() {
  clearInterval(refreshTimer);
}

module.exports = { activate, deactivate };
