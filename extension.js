// ai-usage-statusbar/extension.js
const vscode = require("vscode");
const fs = require("fs");
const os = require("os");
const path = require("path");

const COPILOT_USAGE_URL = "https://api.github.com/copilot_internal/user";
const REFRESH_INTERVAL_MS = 30 * 60 * 1000; // 30 minutes
const CODEX_AUTH_PATH = path.join(os.homedir(), ".codex", "auth.json");
const CURSOR_DB_PATH = path.join(
  os.homedir(),
  os.platform() === "win32"
    ? "AppData/Roaming/Cursor/User/globalStorage/state.vscdb"
    : os.platform() === "linux"
    ? ".config/Cursor/User/globalStorage/state.vscdb"
    : "Library/Application Support/Cursor/User/globalStorage/state.vscdb"
);

let statusBarItem;
let chatgptStatusBarItem;
let cursorStatusBarItem;
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

  // ChatGPT/Codex status bar item (slightly lower priority, appears to the right)
  chatgptStatusBarItem = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Left,
    49
  );
  chatgptStatusBarItem.command = "aiUsage.openChatGPTUsage";
  chatgptStatusBarItem.show();
  context.subscriptions.push(chatgptStatusBarItem);

  // Cursor status bar item
  cursorStatusBarItem = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Left,
    48
  );
  cursorStatusBarItem.command = "aiUsage.refreshCursor";
  cursorStatusBarItem.show();
  context.subscriptions.push(cursorStatusBarItem);

  // Register commands
  context.subscriptions.push(
    vscode.commands.registerCommand("copilotUsage.refresh", () => {
      fetchAndRender(true);
    }),
    vscode.commands.registerCommand("copilotUsage.signIn", () => {
      fetchAndRender(true);
    }),
    vscode.commands.registerCommand("aiUsage.openChatGPTUsage", () => {
      vscode.env.openExternal(vscode.Uri.parse("https://chatgpt.com/codex/settings/usage"));
    }),
    vscode.commands.registerCommand("aiUsage.refreshCursor", () => {
      fetchAndRenderCursor();
    })
  );

  // Initial fetch
  await fetchAndRender(false);
  renderChatGPT();
  fetchAndRenderCursor();

  // Periodic refresh
  refreshTimer = setInterval(() => {
    fetchAndRender(false);
    renderChatGPT();
    fetchAndRenderCursor();
  }, REFRESH_INTERVAL_MS);
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
    const planLabel =
      plan === "individual_pro" || plan === "individual" ? "Pro"
      : plan === "business" ? "Biz"
      : plan === "enterprise" ? "Ent"
      : plan;
    statusBarItem.text = `$(copilot) ${planLabel}`;
    statusBarItem.tooltip = `GitHub Copilot ${planLabel}\n不限高级请求\n\n点击刷新`;
    statusBarItem.backgroundColor = undefined;
    return;
  }

  const { entitlement, percent_remaining, unlimited, overage_count } = snap;
  if (unlimited) {
    statusBarItem.text = `$(copilot) ∞`;
    statusBarItem.tooltip = `GitHub Copilot\n高级请求: 无上限\n\n点击刷新`;
    statusBarItem.backgroundColor = undefined;
    return;
  }

  const used = Math.round(entitlement * (1 - percent_remaining / 100));
  const remaining = entitlement - used;
  const pct = Math.round(percent_remaining);
  const overageStr = overage_count > 0 ? `+${overage_count}` : "";

  let icon = "$(copilot)";
  let bgColor = undefined;
  if (pct <= 10) {
    icon = "$(warning)";
    bgColor = new vscode.ThemeColor("statusBarItem.warningBackground");
  } else if (pct <= 25) {
    bgColor = new vscode.ThemeColor("statusBarItem.warningBackground");
  }

  statusBarItem.text = `${icon} ${remaining}/${entitlement}${overageStr}`;
  statusBarItem.tooltip = [
    `GitHub Copilot 高级请求`,
    `已用: ${used} / ${entitlement}`,
    `剩余: ${remaining} (${pct}%)`,
    resetDate ? `重置日期: ${resetDate}` : "",
    overage_count > 0 ? `超额使用: ${overage_count} 次` : "",
    ``,
    `点击刷新`,
  ].filter(Boolean).join("\n");
  statusBarItem.backgroundColor = bgColor;
}

// ---------- ChatGPT / Codex ----------

function readCodexAuth() {
  try {
    if (!fs.existsSync(CODEX_AUTH_PATH)) return null;
    const raw = fs.readFileSync(CODEX_AUTH_PATH, "utf8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function decodeJwtPayload(token) {
  try {
    const part = token.split(".")[1];
    // pad base64url
    const padded = part + "=".repeat((4 - (part.length % 4)) % 4);
    const json = Buffer.from(padded, "base64").toString("utf8");
    return JSON.parse(json);
  } catch {
    return null;
  }
}

function renderChatGPT() {
  const auth = readCodexAuth();
  if (!auth || !auth.tokens) {
    chatgptStatusBarItem.text = "$(comment) ChatGPT: 未安装";
    chatgptStatusBarItem.tooltip = "未找到 ~/.codex/auth.json\n请先登录 Codex 插件";
    return;
  }

  // Get plan from access_token
  const accessPayload = decodeJwtPayload(auth.tokens.access_token ?? "");
  const openaiAuth = accessPayload?.["https://api.openai.com/auth"] ?? {};
  const plan = openaiAuth.chatgpt_plan_type ?? "unknown";

  // Get subscription until from id_token (more fields there)
  const idPayload = decodeJwtPayload(auth.tokens.id_token ?? "");
  const idAuth = idPayload?.["https://api.openai.com/auth"] ?? {};
  const activeUntil = idAuth.chatgpt_subscription_active_until ?? null;

  const planLabel =
    plan === "plus" ? "Plus" :
    plan === "pro" ? "Pro" :
    plan === "free" ? "Free" :
    plan.charAt(0).toUpperCase() + plan.slice(1);

  let renewalStr = "";
  let renewalFull = "";
  if (activeUntil) {
    const d = new Date(activeUntil);
    renewalStr = " · 续" + d.toLocaleDateString("zh-CN", { month: "numeric", day: "numeric" });
    renewalFull = "订阅到期: " + d.toLocaleDateString("zh-CN", { year: "numeric", month: "long", day: "numeric" });
  }

  chatgptStatusBarItem.text = `$(comment) ${planLabel}`;
  chatgptStatusBarItem.tooltip = [
    `ChatGPT ${planLabel} 订阅`,
    renewalFull,
    "",
    "实时用量请在 Codex 插件中查看",
    "点击打开 chatgpt.com/codex/settings/usage",
  ].filter(Boolean).join("\n");
  chatgptStatusBarItem.backgroundColor = undefined;
}

function deactivate() {
  clearInterval(refreshTimer);
}

// ---------- Cursor ----------

const { execSync } = require("child_process");

function readCursorDb(key) {
  try {
    if (!fs.existsSync(CURSOR_DB_PATH)) return null;
    const result = execSync(
      `sqlite3 "${CURSOR_DB_PATH}" "SELECT value FROM ItemTable WHERE key='${key}';"`,
      { encoding: "utf8", timeout: 4000 }
    ).trim();
    return result || null;
  } catch {
    return null;
  }
}

async function fetchAndRenderCursor() {
  cursorStatusBarItem.text = "$(sync~spin) Cursor";
  cursorStatusBarItem.tooltip = "Cursor 用量加载中…";

  const token = readCursorDb("cursorAuth/accessToken");
  const plan = readCursorDb("cursorAuth/stripeMembershipType") ?? "unknown";
  const status = readCursorDb("cursorAuth/stripeSubscriptionStatus") ?? "";

  if (!token) {
    cursorStatusBarItem.text = "$(cursor) Cursor: 未登录";
    cursorStatusBarItem.tooltip = "未找到 Cursor 登录信息\n请先在 Cursor 中登录账号";
    return;
  }

  // Decode JWT for userId
  const payload = decodeJwtPayload(token);
  const sub = payload?.sub ?? "";
  const userId = sub.includes("|") ? sub.split("|").pop() : sub;

  const planLabel =
    plan === "pro" ? "Pro" :
    plan === "free" ? "Free" :
    plan === "business" ? "Business" :
    plan.charAt(0).toUpperCase() + plan.slice(1);

  try {
    const res = await fetch(
      `https://api2.cursor.sh/auth/usage?user=${encodeURIComponent(userId)}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      }
    );

    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();

    // Aggregate numRequests across all models
    let totalRequests = 0;
    let maxRequests = null;
    let startOfMonth = null;
    for (const [key, val] of Object.entries(data)) {
      if (key === "startOfMonth") { startOfMonth = val; continue; }
      if (typeof val === "object" && val !== null) {
        totalRequests += val.numRequests ?? 0;
        if (val.maxRequestUsage) maxRequests = val.maxRequestUsage;
      }
    }

    const resetStr = startOfMonth
      ? new Date(startOfMonth).toLocaleDateString("zh-CN", { month: "numeric", day: "numeric" })
      : "";

    const usageStr = maxRequests
      ? `${totalRequests}/${maxRequests}`
      : `${totalRequests}`;

    cursorStatusBarItem.text = `$(cursor) ${usageStr}`;
    cursorStatusBarItem.tooltip = [
      `Cursor ${planLabel}${status === "active" ? " (订阅中)" : ""}`,
      `本月请求数: ${totalRequests}${maxRequests ? " / " + maxRequests : ""}`,
      resetStr ? `计费周期开始: ${resetStr}` : "",
      "",
      "点击刷新",
    ].filter(Boolean).join("\n");
    cursorStatusBarItem.backgroundColor = undefined;
  } catch (e) {
    cursorStatusBarItem.text = `$(cursor) -`;
    cursorStatusBarItem.tooltip = `Cursor 获取失败: ${e.message}\n点击重试`;
    cursorStatusBarItem.backgroundColor = new vscode.ThemeColor("statusBarItem.warningBackground");
  }
}

module.exports = { activate, deactivate };
