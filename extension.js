// ai-usage-statusbar/extension.js
const vscode = require("vscode");
const fs = require("fs");
const os = require("os");
const path = require("path");

const COPILOT_USAGE_URL = "https://api.github.com/copilot_internal/user";
const REFRESH_INTERVAL_MS = 30 * 60 * 1000; // 30 minutes
const CODEX_DIR = path.join(os.homedir(), ".codex");
const CODEX_AUTH_PATH = path.join(CODEX_DIR, "auth.json");
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
let chatgptLastUpdatedAt;
const CURSOR_ICON_FALLBACK = "◈";

function getCursorPrefix() {
  // NOTE:
  // Custom contributed icons are not reliably rendered inside StatusBarItem.text
  // across VS Code versions/themes. Keep a stable visible unicode fallback.
  return CURSOR_ICON_FALLBACK;
}

function getConfig() {
  return vscode.workspace.getConfiguration('aiUsage');
}

function pickFirstNonEmpty(...values) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
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

async function getGitHubSession(interactive) {
  try {
    const session = await vscode.authentication.getSession(
      "github",
      ["read:user"],
      { createIfNone: interactive, silent: !interactive }
    );
    return session ?? null;
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

  const session = await getGitHubSession(interactive);
  const token = session?.accessToken ?? null;
  const accountLabel = session?.account?.label ?? null;
  if (!token) {
    statusBarItem.text = "$(github) Copilot: 未登录";
    statusBarItem.tooltip =
      "点击登录 GitHub 以显示 Copilot 用量\n(运行命令: Copilot Usage: Sign in to GitHub)";
    statusBarItem.command = "copilotUsage.signIn";
    return;
  }

  try {
    const data = await fetchCopilotUsage(token);
    renderUsage(data, accountLabel);
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

function renderUsage(data, accountLabel) {
  const verbose = getConfig().get('style', 'minimal') === 'verbose';
  const plan = data.copilot_plan ?? "unknown";
  const resetDate = fmtResetDate(data.quota_reset_date);
  const resetDaysLabel = formatRemainingDaysLabel(new Date(data.quota_reset_date).getTime());
  const resetDaysPrefix = resetDaysLabel ? `${resetDaysLabel} ` : "";
  const snap = data.quota_snapshots?.premium_interactions;

  if (!snap) {
    const planLabel =
      plan === "individual_pro" || plan === "individual" ? "Pro"
      : plan === "business" ? "Biz"
      : plan === "enterprise" ? "Ent"
      : plan;
    statusBarItem.text = verbose ? `$(github) ${resetDaysPrefix}Copilot ${planLabel}` : `$(github) ${resetDaysPrefix}${planLabel}`;
    statusBarItem.tooltip = [
      `GitHub Copilot ${planLabel}`,
      accountLabel ? `账号: ${accountLabel}` : "",
      `不限高级请求`,
      "",
      `点击刷新`,
    ].filter(Boolean).join("\n");
    statusBarItem.backgroundColor = undefined;
    return;
  }

  const { entitlement, percent_remaining, unlimited, overage_count } = snap;
  if (unlimited) {
    statusBarItem.text = verbose ? `$(github) ${resetDaysPrefix}Copilot ∞` : `$(github) ${resetDaysPrefix}∞`;
    statusBarItem.tooltip = [
      `GitHub Copilot`,
      accountLabel ? `账号: ${accountLabel}` : "",
      `高级请求: 无上限`,
      "",
      `点击刷新`,
    ].filter(Boolean).join("\n");
    statusBarItem.backgroundColor = undefined;
    return;
  }

  const used = Math.round(entitlement * (1 - percent_remaining / 100));
  const remaining = entitlement - used;
  const pct = Math.round(percent_remaining);
  const overageStr = overage_count > 0 ? `+${overage_count}` : "0";

  let bgColor = undefined;
  if (pct <= 10) {
    bgColor = new vscode.ThemeColor("statusBarItem.warningBackground");
  } else if (pct <= 25) {
    bgColor = new vscode.ThemeColor("statusBarItem.warningBackground");
  }

  statusBarItem.text = verbose
    ? `$(github) ${resetDaysPrefix}Copilot ${remaining}/${entitlement} ${pct}%`
    : `$(github) ${resetDaysPrefix}${remaining}/${entitlement} ${pct}%`;
  statusBarItem.tooltip = [
    `GitHub Copilot 高级请求`,
    accountLabel ? `账号: ${accountLabel}` : "",
    `已用: ${used} / ${entitlement}`,
    `剩余: ${remaining} (${pct}%)`,
    overage_count > 0 ? `On-Demand(超额): ${overageStr}` : "",
    resetDate ? `重置日期: ${resetDate}` : "",
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
    const logsDbPath = getLatestCodexLogsDbPath();
    if (!logsDbPath) return null;
    // Query most recent log entry that contains codex rate limit headers
    const { execSync } = require("child_process");
    const sql = "SELECT feedback_log_body FROM logs WHERE feedback_log_body LIKE '%x-codex-primary-used-percent%' ORDER BY ts DESC LIMIT 1;";
    const result = execSync(
      `sqlite3 "${logsDbPath}" "${sql.replace(/"/g, '\\"')}"`,
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
      creditsBalance:     extract("x-codex-credits-balance"),
      creditsHasCredits:  extract("x-codex-credits-has-credits"),
      creditsUnlimited:   extract("x-codex-credits-unlimited"),
    };
  } catch {
    return null;
  }
}

function getLatestCodexLogsDbPath() {
  try {
    if (!fs.existsSync(CODEX_DIR)) return null;
    const candidates = fs.readdirSync(CODEX_DIR)
      .filter((name) => /^logs_\d+\.sqlite$/.test(name))
      .map((name) => {
        const fullPath = path.join(CODEX_DIR, name);
        let stat;
        try {
          stat = fs.statSync(fullPath);
        } catch {
          return null;
        }
        const match = name.match(/^logs_(\d+)\.sqlite$/);
        return {
          fullPath,
          size: stat.size,
          mtimeMs: stat.mtimeMs,
          index: match ? parseInt(match[1], 10) : -1,
        };
      })
      .filter(Boolean)
      .filter((entry) => entry.size > 0)
      .sort((a, b) => {
        if (b.mtimeMs !== a.mtimeMs) return b.mtimeMs - a.mtimeMs;
        return b.index - a.index;
      });
    return candidates[0]?.fullPath ?? null;
  } catch {
    return null;
  }
}

function parseBoolLike(value) {
  if (typeof value !== "string") return null;
  const v = value.trim().toLowerCase();
  if (v === "true" || v === "1" || v === "yes") return true;
  if (v === "false" || v === "0" || v === "no") return false;
  return null;
}

function formatOnDemandBalance(value) {
  if (typeof value !== "string") return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return value;
  if (n >= 1000) return n.toFixed(0);
  if (n >= 100) return n.toFixed(1);
  return n.toFixed(2);
}

function formatRemainingWindowLabel(resetAtSec, unit) {
  const ts = parseInt(resetAtSec, 10);
  if (!Number.isFinite(ts) || ts <= 0) return null;
  const remainingMs = Math.max(0, ts * 1000 - Date.now());
  if (unit === "hours") {
    if (remainingMs < 60 * 60 * 1000) {
      const m = Math.max(1, Math.ceil(remainingMs / (60 * 1000)));
      return `${m}m`;
    }
    const h = Math.max(1, Math.ceil(remainingMs / (60 * 60 * 1000)));
    return `${h}h`;
  }
  if (unit === "days") {
    if (remainingMs < 24 * 60 * 60 * 1000) {
      const h = Math.max(1, Math.ceil(remainingMs / (60 * 60 * 1000)));
      return `${h}h`;
    }
    const d = Math.max(1, Math.ceil(remainingMs / (24 * 60 * 60 * 1000)));
    return `${d}d`;
  }
  return null;
}

function formatRemainingDaysLabel(targetMs) {
  if (!Number.isFinite(targetMs) || targetMs <= 0) return null;
  const remainingMs = Math.max(0, targetMs - Date.now());
  if (remainingMs < 24 * 60 * 60 * 1000) {
    const hours = Math.max(1, Math.ceil(remainingMs / (60 * 60 * 1000)));
    return `${hours}h`;
  }
  const days = Math.ceil(remainingMs / (24 * 60 * 60 * 1000));
  return `${days}d`;
}

function formatLastUpdatedLabel(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return null;
  return date.toLocaleString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

function getNextResetFromStartOfMonth(startOfMonth) {
  if (!startOfMonth) return null;
  const start = new Date(startOfMonth);
  if (Number.isNaN(start.getTime())) return null;
  const next = new Date(start);
  next.setMonth(next.getMonth() + 1);
  return next;
}

function renderChatGPT() {
  chatgptLastUpdatedAt = new Date();
  const lastUpdatedLabel = formatLastUpdatedLabel(chatgptLastUpdatedAt);
  const auth = readCodexAuth();
  if (!auth || !auth.tokens) {
    chatgptStatusBarItem.text = "$(openai) ChatGPT: 未安装";
    chatgptStatusBarItem.tooltip = [
      "未找到 ~/.codex/auth.json",
      "请先登录 Codex 插件",
      lastUpdatedLabel ? `上次更新: ${lastUpdatedLabel}` : "",
    ].filter(Boolean).join("\n");
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
  const accountLabel = pickFirstNonEmpty(
    idAuth.email,
    openaiAuth.email,
    idPayload?.email,
    accessPayload?.email,
    idAuth.preferred_username,
    openaiAuth.preferred_username,
    idPayload?.preferred_username,
    accessPayload?.preferred_username,
    idAuth.name,
    openaiAuth.name,
    idPayload?.name,
    accessPayload?.name,
    idAuth.sub,
    openaiAuth.sub
  );

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
  const renewalDaysLabel = formatRemainingDaysLabel(new Date(activeUntil).getTime());
  const renewalDaysPrefix = renewalDaysLabel ? `${renewalDaysLabel} ` : "";

  // Try to read rate limit data from Codex logs SQLite
  const rl = readCodexRateLimits();
  const hasCompleteUsage = rl && rl.primaryUsedPct !== null && rl.secondaryUsedPct !== null;
  let usageStr = "";
  let usageTooltip = "";
  if (hasCompleteUsage) {
    const primUsed = parseInt(rl.primaryUsedPct, 10);
    const secUsed  = parseInt(rl.secondaryUsedPct, 10);
    const primRem  = 100 - primUsed;
    const secRem   = 100 - secUsed;
    const primWinFallback = rl.primaryWindowMin ? `${Math.round(parseInt(rl.primaryWindowMin, 10) / 60)}h` : "5h";
    const secWinFallback  = rl.secondaryWindowMin ? `${Math.round(parseInt(rl.secondaryWindowMin, 10) / (60 * 24))}d` : "7d";
    const primWin = formatRemainingWindowLabel(rl.primaryResetAt, "hours") ?? primWinFallback;
    const secWin  = formatRemainingWindowLabel(rl.secondaryResetAt, "days") ?? secWinFallback;

    let resetStr = "";
    if (rl.secondaryResetAt) {
      const resetDate = new Date(parseInt(rl.secondaryResetAt, 10) * 1000);
      resetStr = resetDate.toLocaleDateString("zh-CN", { month: "numeric", day: "numeric" });
    }
    const hasCredits = parseBoolLike(rl.creditsHasCredits);
    const unlimitedCredits = parseBoolLike(rl.creditsUnlimited);
    const onDemandStr = unlimitedCredits === true
      ? "∞"
      : hasCredits === false
      ? "0"
      : formatOnDemandBalance(rl.creditsBalance);
    // Show both windows in status bar text using remaining time labels.
    usageStr = `${primWin} ${primRem}% ${secWin} ${secRem}%`;
    if (Math.min(primRem, secRem) <= 20 || hasCredits === false) {
      chatgptStatusBarItem.backgroundColor = new vscode.ThemeColor("statusBarItem.warningBackground");
    } else {
      chatgptStatusBarItem.backgroundColor = undefined;
    }

    usageTooltip = [
      `ChatGPT/Codex 用量 (${planLabel})`,
      accountLabel ? `账号: ${accountLabel}` : "",
      lastUpdatedLabel ? `上次更新: ${lastUpdatedLabel}` : "",
      `${primWin} 窗口: 已用 ${primUsed}% / 剩余 ${primRem}%`,
      `${secWin} 窗口: 已用 ${secUsed}% / 剩余 ${secRem}%`,
      onDemandStr ? `On-Demand: ${onDemandStr}${unlimitedCredits === true ? " (不限额)" : ""}` : "",
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
      accountLabel ? `账号: ${accountLabel}` : "",
      lastUpdatedLabel ? `上次更新: ${lastUpdatedLabel}` : "",
      renewalFull,
      "",
      "暂无 Codex 用量数据（需先使用 Codex 插件发起请求）",
      "点击打开 chatgpt.com/codex/settings/usage",
    ].filter(Boolean).join("\n");
  }

  const displayLabel = hasCompleteUsage
    ? (verbose ? `$(openai) ${renewalDaysPrefix}Codex ${usageStr}` : `$(openai) ${renewalDaysPrefix}${usageStr}`)
    : (verbose ? `$(openai) ${renewalDaysPrefix}ChatGPT ${planLabel}` : `$(openai) ${renewalDaysPrefix}${planLabel}`);

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
  const cursorPrefix = getCursorPrefix();
  cursorStatusBarItem.text = "$(sync~spin) Cursor";
  cursorStatusBarItem.tooltip = "Cursor 用量加载中…";

  const token = readCursorDb("cursorAuth/accessToken");
  const plan = readCursorDb("cursorAuth/stripeMembershipType") ?? "unknown";
  const status = readCursorDb("cursorAuth/stripeSubscriptionStatus") ?? "";
  const cachedEmail = readCursorDb("cursorAuth/cachedEmail");

  if (!token) {
    cursorStatusBarItem.text = `${cursorPrefix} Cursor: 未登录`;
    cursorStatusBarItem.tooltip = "未找到 Cursor 登录信息\n请先在 Cursor 中登录账号";
    return;
  }

  // Decode JWT for userId (used for fallback API call)
  const payload = decodeJwtPayload(token);
  const sub = payload?.sub ?? "";
  const userId = sub.includes("|") ? sub.split("|").pop() : sub;
  const accountLabel = pickFirstNonEmpty(
    cachedEmail,
    payload?.email,
    payload?.preferred_username,
    payload?.name,
    payload?.nickname
  );

  const planLabel =
    plan === "pro" ? "Pro" :
    plan === "free" ? "Free" :
    plan === "business" ? "Business" :
    plan.charAt(0).toUpperCase() + plan.slice(1);

  try {
    // Preferred API: exposes Auto+Composer and API percentages separately.
    const periodData = await fetchCursorCurrentPeriodUsage(token);
    const planUsage = periodData?.planUsage;
    const spendLimitUsage = periodData?.spendLimitUsage;

    const formatUsd = (cents) => {
      if (typeof cents !== "number" || !Number.isFinite(cents)) return null;
      return `$${(cents / 100).toFixed(2)}`;
    };

    const odUsed = formatUsd(spendLimitUsage?.individualUsed);
    const odLimit = formatUsd(spendLimitUsage?.individualLimit);
    const odRem = formatUsd(spendLimitUsage?.individualRemaining);
    const odStr = odUsed && odLimit ? `${odUsed}/${odLimit}` : "-";

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
      const usageStr = odUsed && odLimit
        ? `${autoRem}% ${apiRem}% ${odStr}`
        : `${autoRem}% ${apiRem}%`;

      const billingStart = periodData?.billingCycleStart
        ? new Date(parseInt(periodData.billingCycleStart, 10))
        : null;
      const billingEnd = periodData?.billingCycleEnd
        ? new Date(parseInt(periodData.billingCycleEnd, 10))
        : null;
      const resetDaysLabel = billingEnd ? formatRemainingDaysLabel(billingEnd.getTime()) : null;
      const resetDaysPrefix = resetDaysLabel ? `${resetDaysLabel} ` : "";
      const cycleStr = billingStart && billingEnd
        ? `${billingStart.toLocaleDateString("zh-CN", { month: "numeric", day: "numeric" })} - ${billingEnd.toLocaleDateString("zh-CN", { month: "numeric", day: "numeric" })}`
        : "";

      cursorStatusBarItem.text = verbose ? `${cursorPrefix} ${resetDaysPrefix}Cursor ${usageStr}` : `${cursorPrefix} ${resetDaysPrefix}${usageStr}`;
      cursorStatusBarItem.tooltip = [
        `Cursor ${planLabel}${status === "active" ? " (订阅中)" : ""}`,
        accountLabel ? `账号: ${accountLabel}` : "",
        `Auto + Composer: 已用 ${autoUsed}% / 剩余 ${autoRem}%`,
        `API: 已用 ${apiUsed}% / 剩余 ${apiRem}%`,
        odUsed && odLimit
          ? `On-Demand: 已用 ${odUsed} / 限额 ${odLimit}${odRem ? ` / 剩余 ${odRem}` : ""}`
          : `On-Demand: 当前接口未提供`,
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
    const nextReset = getNextResetFromStartOfMonth(startOfMonth);
    const resetDaysLabel = nextReset ? formatRemainingDaysLabel(nextReset.getTime()) : null;
    const resetDaysPrefix = resetDaysLabel ? `${resetDaysLabel} ` : "";

    const verbose = getConfig().get('style', 'minimal') === 'verbose';
    cursorStatusBarItem.text = verbose ? `${cursorPrefix} ${resetDaysPrefix}Cursor - -` : `${cursorPrefix} ${resetDaysPrefix}- -`;
    cursorStatusBarItem.tooltip = [
      `Cursor ${planLabel}${status === "active" ? " (订阅中)" : ""}`,
      accountLabel ? `账号: ${accountLabel}` : "",
      `当前接口未返回 Auto/API 余量百分比，已回退到旧接口。`,
      `On-Demand: 当前接口未提供`,
      `本月请求数: ${totalRequests}${maxRequests ? " / " + maxRequests : ""}`,
      resetStr ? `计费周期开始: ${resetStr}` : "",
      "",
      "点击刷新",
    ].filter(Boolean).join("\n");
    cursorStatusBarItem.backgroundColor = undefined;
  } catch (e) {
    cursorStatusBarItem.text = `${cursorPrefix} -`;
    cursorStatusBarItem.tooltip = `Cursor 获取失败: ${e.message}\n点击重试`;
    cursorStatusBarItem.backgroundColor = new vscode.ThemeColor("statusBarItem.warningBackground");
  }
}

module.exports = { activate, deactivate };
