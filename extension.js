// ai-usage-statusbar/extension.js
const vscode = require("vscode");
const fs = require("fs");
const os = require("os");
const path = require("path");

const COPILOT_USAGE_URL = "https://api.github.com/copilot_internal/user";
const REFRESH_INTERVAL_MS = 30 * 60 * 1000; // 30 minutes
const CODEX_AUTH_PATH = path.join(os.homedir(), ".codex", "auth.json");
const CODEX_LOGS_DB_PATH = path.join(os.homedir(), ".codex", "logs_1.sqlite");
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

function getConfig() {
  return vscode.workspace.getConfiguration('aiUsage');
}

function applyProviderVisibility() {
  const cfg = getConfig();
  cfg.get('providers.copilot', true) ? statusBarItem.show() : statusBarItem.hide();
  cfg.get('providers.chatgpt', true) ? chatgptStatusBarItem.show() : chatgptStatusBarItem.hide();
  cfg.get('providers.cursor', true) ? cursorStatusBarItem.show() : cursorStatusBarItem.hide();
}

async function activate(context) {
  // Create status bar item (left side, low priority so it doesn't crowd)
  statusBarItem = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Left,
    50
  );
  statusBarItem.command = "copilotUsage.refresh";
  statusBarItem.tooltip = "GitHub Copilot 用量 · 点击刷新";
  context.subscriptions.push(statusBarItem);

  // ChatGPT/Codex status bar item (slightly lower priority, appears to the right)
  chatgptStatusBarItem = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Left,
    49
  );
  chatgptStatusBarItem.command = "aiUsage.openChatGPTUsage";
  context.subscriptions.push(chatgptStatusBarItem);

  // Cursor status bar item
  cursorStatusBarItem = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Left,
    48
  );
  cursorStatusBarItem.command = "aiUsage.refreshCursor";
  context.subscriptions.push(cursorStatusBarItem);

  // Apply initial visibility from settings
  applyProviderVisibility();

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

  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration(e => {
      if (e.affectsConfiguration('aiUsage')) {
        applyProviderVisibility();
        fetchAndRender(false);
        renderChatGPT();
        fetchAndRenderCursor();
      }
    })
  );
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
  const verbose = getConfig().get('style', 'minimal') === 'verbose';
  const plan = data.copilot_plan ?? "unknown";
  const resetDate = fmtResetDate(data.quota_reset_date);
  const snap = data.quota_snapshots?.premium_interactions;

  if (!snap) {
    const planLabel =
      plan === "individual_pro" || plan === "individual" ? "Pro"
      : plan === "business" ? "Biz"
      : plan === "enterprise" ? "Ent"
      : plan;
    statusBarItem.text = verbose ? `$(copilot) Copilot ${planLabel}` : `$(copilot) ${planLabel}`;
    statusBarItem.tooltip = `GitHub Copilot ${planLabel}\n不限高级请求\n\n点击刷新`;
    statusBarItem.backgroundColor = undefined;
    return;
  }

  const { entitlement, percent_remaining, unlimited, overage_count } = snap;
  if (unlimited) {
    statusBarItem.text = verbose ? `$(copilot) Copilot ∞` : `$(copilot) ∞`;
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
    bgColor = new vscode.ThemeColor("statusBarItem.warningBackground");
  } else if (pct <= 25) {
    bgColor = new vscode.ThemeColor("statusBarItem.warningBackground");
  }

  statusBarItem.text = verbose ? `${icon} Copilot ${remaining}/${entitlement} ${pct}%` : `${icon} ${remaining}/${entitlement} ${pct}%`;
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

function readCodexRateLimits() {
  try {
    if (!fs.existsSync(CODEX_LOGS_DB_PATH)) return null;
    // Query most recent log entry that contains codex rate limit headers
    const { execSync } = require("child_process");
    const sql = "SELECT feedback_log_body FROM logs WHERE feedback_log_body LIKE '%x-codex-primary-used-percent%' ORDER BY ts DESC LIMIT 1;";
    const result = execSync(
      `sqlite3 "${CODEX_LOGS_DB_PATH}" "${sql.replace(/"/g, '\\"')}"`,
      { encoding: "utf8", timeout: 4000 }
    ).trim();
    if (!result) return null;

    // Extract individual header values via regex (the JSON may be truncated in the log)
    const extract = (key) => {
      const m = result.match(new RegExp(`"${key}":\\s*"([^"]*)"`));
      return m ? m[1] : null;
    };
    return {
      planType:           extract("x-codex-plan-type"),
      primaryUsedPct:     extract("x-codex-primary-used-percent"),
      secondaryUsedPct:   extract("x-codex-secondary-used-percent"),
      primaryWindowMin:   extract("x-codex-primary-window-minutes"),
      secondaryWindowMin: extract("x-codex-secondary-window-minutes"),
      primaryResetAt:     extract("x-codex-primary-reset-at"),
      secondaryResetAt:   extract("x-codex-secondary-reset-at"),
    };
  } catch {
    return null;
  }
}

function renderChatGPT() {
  const auth = readCodexAuth();
  if (!auth || !auth.tokens) {
    chatgptStatusBarItem.text = "$(openai) ChatGPT: 未安装";
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

  const verbose = getConfig().get('style', 'minimal') === 'verbose';

  // Try to read rate limit data from Codex logs SQLite
  const rl = readCodexRateLimits();
  let usageStr = "";
  let usageTooltip = "";
  if (rl && rl.primaryUsedPct !== null && rl.secondaryUsedPct !== null) {
    const primUsed = parseInt(rl.primaryUsedPct, 10);
    const secUsed  = parseInt(rl.secondaryUsedPct, 10);
    const primRem  = 100 - primUsed;
    const secRem   = 100 - secUsed;
    const primWin  = rl.primaryWindowMin ? `${Math.round(parseInt(rl.primaryWindowMin, 10) / 60)}h` : "5h";
    const secWin   = rl.secondaryWindowMin ? `${Math.round(parseInt(rl.secondaryWindowMin, 10) / (60 * 24))}d` : "7d";

    let resetStr = "";
    if (rl.secondaryResetAt) {
      const resetDate = new Date(parseInt(rl.secondaryResetAt, 10) * 1000);
      resetStr = resetDate.toLocaleDateString("zh-CN", { month: "numeric", day: "numeric" });
    }

    // Show both windows in status bar text: 5h and 7d.
    usageStr = `5h${primRem}% 7d${secRem}%`;
    if (Math.min(primRem, secRem) <= 20) {
      chatgptStatusBarItem.backgroundColor = new vscode.ThemeColor("statusBarItem.warningBackground");
    } else {
      chatgptStatusBarItem.backgroundColor = undefined;
    }

    usageTooltip = [
      `ChatGPT/Codex 用量 (${planLabel})`,
      `${primWin} 窗口: 已用 ${primUsed}% / 剩余 ${primRem}%`,
      `${secWin} 窗口: 已用 ${secUsed}% / 剩余 ${secRem}%`,
      resetStr ? `7d 窗口重置: ${resetStr}` : "",
      renewalFull,
      "",
      "数据来自 Codex 最近一次 API 调用的响应头",
      "点击打开 chatgpt.com/codex/settings/usage",
    ].filter(Boolean).join("\n");
  } else {
    chatgptStatusBarItem.backgroundColor = undefined;
    usageTooltip = [
      `ChatGPT ${planLabel} 订阅`,
      renewalFull,
      "",
      "暂无 Codex 用量数据（需先使用 Codex 插件发起请求）",
      "点击打开 chatgpt.com/codex/settings/usage",
    ].filter(Boolean).join("\n");
  }

  const displayLabel = rl && rl.primaryUsedPct !== null
    ? (verbose ? `$(openai) Codex ${usageStr}` : `$(openai) ${usageStr}`)
    : (verbose ? `$(openai) ChatGPT ${planLabel}` : `$(openai) ${planLabel}`);

  chatgptStatusBarItem.text = displayLabel;
  chatgptStatusBarItem.tooltip = usageTooltip;
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

async function fetchCursorCurrentPeriodUsage(token) {
  const res = await fetch(
    "https://api2.cursor.sh/aiserver.v1.DashboardService/GetCurrentPeriodUsage",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: "{}",
    }
  );
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function fetchAndRenderCursor() {
  cursorStatusBarItem.text = "$(sync~spin) Cursor";
  cursorStatusBarItem.tooltip = "Cursor 用量加载中…";

  const token = readCursorDb("cursorAuth/accessToken");
  const plan = readCursorDb("cursorAuth/stripeMembershipType") ?? "unknown";
  const status = readCursorDb("cursorAuth/stripeSubscriptionStatus") ?? "";

  if (!token) {
    cursorStatusBarItem.text = "$(cursor-logo) Cursor: 未登录";
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
    // Preferred API: exposes Auto+Composer and API percentages separately.
    const periodData = await fetchCursorCurrentPeriodUsage(token);
    const planUsage = periodData?.planUsage;

    if (
      planUsage &&
      typeof planUsage.autoPercentUsed === "number" &&
      typeof planUsage.apiPercentUsed === "number"
    ) {
      const autoUsed = Math.round(planUsage.autoPercentUsed);
      const apiUsed = Math.round(planUsage.apiPercentUsed);
      const totalUsed = typeof planUsage.totalPercentUsed === "number"
        ? Math.round(planUsage.totalPercentUsed)
        : Math.max(autoUsed, apiUsed);

      const autoRem = Math.max(0, 100 - autoUsed);
      const apiRem = Math.max(0, 100 - apiUsed);
      const verbose = getConfig().get('style', 'minimal') === 'verbose';
      const usageStr = verbose
        ? `AUTO${autoRem}% API${apiRem}%`
        : `AUTO${autoRem}% API${apiRem}%`;

      const billingStart = periodData?.billingCycleStart
        ? new Date(parseInt(periodData.billingCycleStart, 10))
        : null;
      const billingEnd = periodData?.billingCycleEnd
        ? new Date(parseInt(periodData.billingCycleEnd, 10))
        : null;
      const cycleStr = billingStart && billingEnd
        ? `${billingStart.toLocaleDateString("zh-CN", { month: "numeric", day: "numeric" })} - ${billingEnd.toLocaleDateString("zh-CN", { month: "numeric", day: "numeric" })}`
        : "";

      cursorStatusBarItem.text = verbose ? `$(cursor-logo) Cursor ${usageStr}` : `$(cursor-logo) ${usageStr}`;
      cursorStatusBarItem.tooltip = [
        `Cursor ${planLabel}${status === "active" ? " (订阅中)" : ""}`,
        `Auto + Composer: 已用 ${autoUsed}% / 剩余 ${autoRem}%`,
        `API: 已用 ${apiUsed}% / 剩余 ${apiRem}%`,
        `总计: 已用 ${totalUsed}%`,
        cycleStr ? `计费周期: ${cycleStr}` : "",
        periodData?.displayMessage ? `提示: ${periodData.displayMessage}` : "",
        "",
        "点击刷新",
      ].filter(Boolean).join("\n");

      if (Math.max(autoUsed, apiUsed) >= 90) {
        cursorStatusBarItem.backgroundColor = new vscode.ThemeColor("statusBarItem.warningBackground");
      } else {
        cursorStatusBarItem.backgroundColor = undefined;
      }
      return;
    }

    // Fallback API: older endpoint with aggregated request count.
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

    const verbose = getConfig().get('style', 'minimal') === 'verbose';
    cursorStatusBarItem.text = verbose ? `$(cursor-logo) Cursor AUTO- API-` : `$(cursor-logo) AUTO- API-`;
    cursorStatusBarItem.tooltip = [
      `Cursor ${planLabel}${status === "active" ? " (订阅中)" : ""}`,
      `当前接口未返回 Auto/API 余量百分比，已回退到旧接口。`,
      `本月请求数: ${totalRequests}${maxRequests ? " / " + maxRequests : ""}`,
      resetStr ? `计费周期开始: ${resetStr}` : "",
      "",
      "点击刷新",
    ].filter(Boolean).join("\n");
    cursorStatusBarItem.backgroundColor = undefined;
  } catch (e) {
    cursorStatusBarItem.text = `$(cursor-logo) -`;
    cursorStatusBarItem.tooltip = `Cursor 获取失败: ${e.message}\n点击重试`;
    cursorStatusBarItem.backgroundColor = new vscode.ThemeColor("statusBarItem.warningBackground");
  }
}

module.exports = { activate, deactivate };
