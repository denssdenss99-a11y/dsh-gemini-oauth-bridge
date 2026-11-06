// lib/index.js — host half of dsh-gemini-oauth-bridge.
//
// Bridges Google AI subscriptions (Antigravity / Code Assist OAuth surface)
// into DSH as an OpenAI-compatible endpoint with multi-account failover,
// HTTP/SOCKS5 proxy support, model aliases, and thinking configuration.

import { createServer } from 'node:http';
import { readFileSync, writeFileSync, mkdirSync, renameSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, dirname } from 'node:path';
import { randomBytes } from 'node:crypto';
import {
  OAUTH,
  API,
  VERSION,
  buildAuthUrl,
  tokenExchangeForm,
  tokenRefreshForm,
  parseVersionManifest,
  userAgents,
  openaiToGeminiRequest,
  antigravityEnvelope,
  freshTranslateState,
  geminiToOpenaiFragments,
  assembleNonStreamResponse,
  extractSseEvents,
  unwrapStreamChunk,
  openaiCompletionId,
  resolveTier,
  parseAvailableModels,
  buildProviderYamlLines,
  mergeProviderYaml,
  mergeCredentialYaml,
  PROVIDER_API_KEY_ENV,
  PROVIDER_PLACEHOLDER_KEY,
  DEFAULT_MODEL_ALIASES,
  resolveModelName,
  COMPREHENSIVE_GEMINI_MODELS,
} from './protocol.js';
import { universalFetch, testConnection, resolveProxyUrl } from './proxy.js';
import { getUnblockStatus, refreshProxies, getActiveProxyIp } from './unblock.js';
import {
  runDnsPin,
  removeDnsPin,
  getDnsPinStatus,
  runBinaryPatch,
  revertBinaryPatch,
  getBinaryPatchStatus,
  installWatchdog,
  uninstallWatchdog,
  getWatchdogStatus,
} from './dns-pin.js';

export const inject = ['webServer'];

const ru = {
  "source_none": "Отсутствует",
  "source_cache": "Кэш",
  "source_manifest": "Манифест",
  "source_fallback": "Базовый",
  "source_upstream": "Сервер",
  "source_default": "По умолчанию",
  "notLoggedIn": "Не авторизован — войдите в Google в Настройки → Gemini OAuth",
  "noModels": "Список моделей пуст — обновите список моделей",
  "disabled": "providerSync отключен в файле конфигурации",
  "portBusy": "Порт {port} занят (возможно, идет процесс входа). Закройте мешающий процесс и попробуйте снова.",
  "loginSuccess": "✅ Авторизация успешна",
  "loginFailure": "❌ Ошибка авторизации",
  "closePage": "Эту страницу можно закрыть и вернуться в панель настроек DSH.",
  "googleError": "Google вернул ошибку: {error}",
  "expired": "Сессия авторизации истекла или не совпадает токен состояния. Запустите вход заново в настройках DSH.",
  "accountSummary": "Аккаунт {email} подключен (проект {project}, тариф {tier})",
  "login": "Вход: {value}",
  "loggedOut": "Не авторизован",
  "project": "Проект: {project} (тариф {tier})",
  "version": "Версия клиента: {version} ({source})",
  "models": "Модели: {models} ({source})",
  "endpoint": "Эндпоинт OpenAI-совместимого API: ",
  "providerMerge": "В блоке llm-pi-ai используется встроенное значение, объединение невозможно",
  "credentialMerge": "Файл учетных данных не формата version-1. Добавьте ключ через страницу моделей",
  "refreshRejected": "В обновлении токена отказано ({status}): {text} — требуется повторный вход",
  "refreshFailed": "Сбой обновления токена ({status}): {text}",
  "refreshJson": "Обновление токена вернуло неверный формат (не JSON)",
  "userinfo": "Не удалось получить информацию о пользователе ({status})",
  "loadFailed": "loadCodeAssist сбой ({status}): {text}",
  "onboardFailed": "onboardUser сбой ({status}): {text}",
  "onboardTimeout": "onboardUser не успел завершиться за отведенное время",
  "modelsFailed": "fetchAvailableModels не вернул список доступных моделей",
  "exchangeFailed": "Обмен кода на токен не удался ({status}): {text}",
  "proxySaved": "Настройки прокси сохранены",
  "accountSwitched": "Активный аккаунт изменен на {email}",
  "accountRemoved": "Аккаунт {email} удален",
  "loginCancelled": "Процесс входа отменен, порт освобожден",
  "dnsPinDone": "DNS-пин применён ({count} доменов). Перезапустите DSH.",
  "dnsPinFailed": "DNS-пин не удался: {error}",
  "binaryPatchDone": "Бинарный патч применён. Перезапустите Antigravity.",
  "binaryPatchFailed": "Ошибка бинарного патча: {error}",
  "unlockDone": "Анлок применён успешно.",
  "unlockFailed": "Ошибка анлока: {error}",
  "dnsPinRemoved": "DNS-пин удалён из /etc/hosts.",
  "binaryReverted": "Бинарный патч откачен.",
  "needSudo": "Нужны права sudo. Запустите: sudo bash ~/ag_unlocker_mac.sh",
};

const zh = {
  "source_none": "无",
  "source_cache": "缓存",
  "source_manifest": "版本清单",
  "source_fallback": "兜底",
  "source_upstream": "上游",
  "source_default": "默认",
  "notLoggedIn": "not logged in — 请先在 设置 → Gemini OAuth 中登录 Google 账号",
  "noModels": "no model list yet — 刷新模型列表后再试",
  "disabled": "状态文件中已禁用 providerSync",
  "portBusy": "端口 {port} 被占用（Antigravity 可能正在登录）。关闭占用进程后重试。",
  "loginSuccess": "✅ 登录成功",
  "loginFailure": "❌ 登录失败",
  "closePage": "可以关闭此页面，回到 DSH 设置页查看状态。",
  "googleError": "Google 返回：{error}",
  "expired": "登录会话已过期或状态不匹配，请在 DSH 设置页重新发起登录",
  "accountSummary": "账号 {email} 已接入（项目 {project}，tier {tier}）",
  "login": "登录：{value}",
  "loggedOut": "未登录",
  "project": "项目：{project}（tier {tier}）",
  "version": "客户端版本伪装：{version}（{source}）",
  "models": "模型：{models}（{source}）",
  "endpoint": "OpenAI 兼容端点：",
  "providerMerge": "llm-pi-ai 使用了行内值，无法合并",
  "credentialMerge": "凭据文件不是 version-1 文档，请通过模型页面添加 key",
  "refreshRejected": "refresh rejected ({status}): {text} — 请重新登录",
  "refreshFailed": "token 刷新失败（{status}）：{text}",
  "refreshJson": "token 刷新返回了非 JSON 响应",
  "userinfo": "账号信息获取失败（{status}）",
  "loadFailed": "loadCodeAssist 失败（{status}）：{text}",
  "onboardFailed": "onboardUser 失败（{status}）：{text}",
  "onboardTimeout": "onboardUser 未能及时完成",
  "modelsFailed": "fetchAvailableModels 未返回可用的模型列表",
  "exchangeFailed": "token 交换失败（{status}）：{text}",
  "proxySaved": "代理配置已保存",
  "accountSwitched": "已切换到账号 {email}",
  "accountRemoved": "账号 {email} 已删除",
  "loginCancelled": "登录已取消，端口已释放",
};

const en = {
  "source_none": "None",
  "source_cache": "Cache",
  "source_manifest": "Manifest",
  "source_fallback": "Fallback",
  "source_upstream": "Upstream",
  "source_default": "Default",
  "notLoggedIn": "Not signed in — sign in with Google in Settings → Gemini OAuth first",
  "noModels": "No model list yet — refresh the model list and retry",
  "disabled": "providerSync disabled in state file",
  "portBusy": "Port {port} is in use (Antigravity may be signing in). Close the process using it and retry.",
  "loginSuccess": "✅ Sign-in successful",
  "loginFailure": "❌ Sign-in failed",
  "closePage": "You can close this page and return to DSH Settings to check the status.",
  "googleError": "Google returned: {error}",
  "expired": "The sign-in session expired or its state does not match. Start sign-in again in DSH Settings.",
  "accountSummary": "Account {email} connected (project {project}, tier {tier})",
  "login": "Sign-in: {value}",
  "loggedOut": "Not signed in",
  "project": "Project: {project} (tier {tier})",
  "version": "Client version impersonation: {version} ({source})",
  "models": "Models: {models} ({source})",
  "endpoint": "OpenAI-compatible endpoint: ",
  "providerMerge": "llm-pi-ai uses an inline value; merge refused",
  "credentialMerge": "credentials file is not a version-1 document; add the key through the Models page",
  "refreshRejected": "Refresh rejected ({status}): {text} — sign in again",
  "refreshFailed": "Token refresh failed ({status}): {text}",
  "refreshJson": "Token refresh returned a non-JSON response",
  "userinfo": "User info failed ({status})",
  "loadFailed": "loadCodeAssist failed ({status}): {text}",
  "onboardFailed": "onboardUser failed ({status}): {text}",
  "onboardTimeout": "onboardUser did not complete in time",
  "modelsFailed": "fetchAvailableModels returned no usable model list",
  "exchangeFailed": "Token exchange failed ({status}): {text}",
  "proxySaved": "Proxy settings saved",
  "accountSwitched": "Switched to account {email}",
  "accountRemoved": "Account {email} removed",
  "loginCancelled": "Sign-in cancelled and port released",
};

function message(key, params = {}) { return { key, params }; }
function renderMessage(value, lang = 'ru') {
  if (!value || typeof value !== 'object') return value;
  const dict = lang === 'en' ? en : (lang === 'zh' ? zh : ru);
  return (dict[value.key] ?? ru[value.key] ?? en[value.key] ?? value.key)
    .replace(/\{(\w+)\}/g, (match, name) => String(value.params?.[name] ?? match));
}
function localizedError(text, descriptor) {
  return Object.assign(new Error(text), { localized: descriptor });
}
function errorMessage(error) { return error?.localized ?? String(error?.message ?? error); }
function renderPayload(value, lang) {
  if (!value || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map((item) => renderPayload(item, lang));
  return Object.fromEntries(Object.entries(value).map(([key, item]) =>
    [key, key === 'error' || key === 'reason' ? renderMessage(item, lang) : renderPayload(item, lang)]));
}
function resolveLang(req) {
  try {
    const lang = new URL(req.url ?? '/', 'http://localhost').searchParams.get('lang');
    if (lang === 'ru' || lang === 'en' || lang === 'zh') return lang;
  } catch {}
  try {
    const text = readFileSync(join(process.env.DSH_HOME || join(homedir(), '.dsh'), 'settings.yaml'), 'utf8');
    let inLocale = false;
    for (const line of text.split(/\r?\n/)) {
      if (!line.trim() || /^\s*#/.test(line)) continue;
      if (/^locale:\s*(?:#.*)?$/.test(line)) { inLocale = true; continue; }
      if (/^\S/.test(line)) inLocale = false;
      if (!inLocale) continue;
      const match = line.match(/^ +preference:\s*(?:"(ru|zh|en)"|'(ru|zh|en)'|(ru|zh|en))\s*(?:#.*)?$/);
      if (match) return match[1] || match[2] || match[3];
    }
  } catch {}
  return 'ru';
}
function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
}
function callbackPage(ok, value, lang) {
  const t = (key) => escapeHtml(renderMessage(message(key), lang));
  return `<!doctype html><html lang="${lang}"><meta charset="utf-8"><body style="font-family:system-ui,-apple-system,BlinkMacSystemFont,sans-serif;padding:40px;background:#0d1117;color:#c9d1d9">` +
    `<div style="max-width:540px;margin:0 auto;background:#161b22;padding:32px;border-radius:12px;border:1px solid #30363d">` +
    `<h2 style="margin-top:0">${t(ok ? 'loginSuccess' : 'loginFailure')}</h2><p style="font-size:15px;line-height:1.5">${escapeHtml(renderMessage(value, lang))}</p>` +
    `<p style="color:#8b949e;font-size:13px">${t('closePage')}</p></div></body></html>`;
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

const STATE_PATH = join(homedir(), '.dsh', 'gemini-oauth-bridge.json');
const SETTINGS_PATH = join(homedir(), '.dsh', 'settings.yaml');
const SETTINGS_BACKUP = join(homedir(), '.dsh', 'settings.yaml.bak-gemini-oauth-bridge');
const CREDENTIALS_PATH = join(homedir(), '.dsh', '.credentials.yaml');
const PROVIDER_NAME = 'gemini-oauth';
const LOGIN_TIMEOUT_MS = 2 * 60 * 1000; // 2 minutes (reduced from 5 to avoid hanging port 51121)
const VERSION_TTL_MS = 6 * 60 * 60 * 1000;
const TOKEN_SKEW_MS = 120 * 1000;
const SIGNATURE_CAP = 800;

const DEFAULT_MODELS = COMPREHENSIVE_GEMINI_MODELS;

let state = loadState();
let loginFlow = null;
let loginOrigin = null;
const refreshPromises = new Map();
let versionInfo = { version: null, source: 'none', fetchedAt: 0 };
const cooldowns = new Map(); // key `${accountId}:${model}` or `${model}` → unix ms
let signatureSaveTimer = null;

function loadState() {
  try {
    const raw = JSON.parse(readFileSync(STATE_PATH, 'utf8'));
    let accounts = Array.isArray(raw.accounts) ? raw.accounts : [];
    if (!accounts.length && raw.tokens) {
      accounts = [{
        id: raw.email || 'primary',
        email: raw.email,
        project: raw.project,
        tier: raw.tier,
        tokens: raw.tokens,
      }];
    }
    const activeAccountId = raw.activeAccountId || accounts[0]?.id || null;
    const activeAccount = accounts.find((a) => a.id === activeAccountId) || accounts[0] || null;

    const loadedModels = Array.isArray(raw.models) && raw.models.length
      ? Array.from(new Set([...raw.models, ...COMPREHENSIVE_GEMINI_MODELS]))
      : COMPREHENSIVE_GEMINI_MODELS;

    return {
      accounts,
      activeAccountId,
      tokens: activeAccount?.tokens || raw.tokens || null,
      email: activeAccount?.email || raw.email || null,
      project: activeAccount?.project || raw.project || null,
      tier: activeAccount?.tier || raw.tier || null,
      models: loadedModels,
      modelCaps: raw.modelCaps && typeof raw.modelCaps === 'object' ? raw.modelCaps : null,
      providerSync: raw.providerSync === false ? false : true,
      providerSyncResult: raw.providerSyncResult && typeof raw.providerSyncResult === 'object' ? raw.providerSyncResult : null,
      antigravityVersion: typeof raw.antigravityVersion === 'string' ? raw.antigravityVersion : null,
      versionFetchedAt: Number(raw.versionFetchedAt) || 0,
      signatures: raw.signatures && typeof raw.signatures === 'object' ? raw.signatures : {},
      apiKey: typeof raw.apiKey === 'string' ? raw.apiKey : null,
      apiConfig: raw.apiConfig && typeof raw.apiConfig === 'object' ? raw.apiConfig : {},
    };
  } catch {
    return {
      accounts: [],
      activeAccountId: null,
      tokens: null,
      email: null,
      project: null,
      tier: null,
      models: COMPREHENSIVE_GEMINI_MODELS,
      modelCaps: null,
      providerSync: true,
      providerSyncResult: null,
      antigravityVersion: null,
      versionFetchedAt: 0,
      signatures: {},
      apiKey: null,
      apiConfig: {},
    };
  }
}

function saveState() {
  mkdirSync(dirname(STATE_PATH), { recursive: true });
  const activeAccount = state.accounts?.find((a) => a.id === state.activeAccountId) || state.accounts?.[0];
  const payload = {
    accounts: state.accounts,
    activeAccountId: state.activeAccountId,
    tokens: activeAccount?.tokens || state.tokens,
    email: activeAccount?.email || state.email,
    project: activeAccount?.project || state.project,
    tier: activeAccount?.tier || state.tier,
    models: state.models,
    modelCaps: state.modelCaps,
    providerSync: state.providerSync,
    providerSyncResult: state.providerSyncResult,
    antigravityVersion: state.antigravityVersion,
    versionFetchedAt: state.versionFetchedAt,
    signatures: state.signatures,
    apiKey: state.apiKey,
    apiConfig: state.apiConfig,
  };
  writeFileSync(STATE_PATH, JSON.stringify(payload, null, 2), { mode: 0o600 });
}

function proxyFetch(url, options = {}) {
  const customProxy = state.apiConfig?.proxy;
  const mode = state.apiConfig?.connectionMode || (customProxy ? 'proxy' : 'auto');
  return universalFetch(url, options, customProxy, mode);
}

const signatureStore = new Map(Object.entries(state.signatures || {}));
function rememberSignature(id, signature) {
  if (!id || !signature) return;
  if (signatureStore.has(id)) signatureStore.delete(id);
  signatureStore.set(id, signature);
  while (signatureStore.size > SIGNATURE_CAP) {
    signatureStore.delete(signatureStore.keys().next().value);
  }
  state.signatures = Object.fromEntries(signatureStore);
  if (!signatureSaveTimer) {
    signatureSaveTimer = setTimeout(() => {
      signatureSaveTimer = null;
      saveState();
    }, 2000);
  }
}

function baseURLs() {
  const cfg = state.apiConfig || {};
  return {
    generate: cfg.generateBase || API.dailyBase,
    load: cfg.loadBase || API.prodBase,
    onboard: cfg.onboardBase || API.dailyBase,
  };
}

async function upstreamJson(url, { method = 'POST', token, ua, body, accept = '*/*', timeoutMs = 15000 }) {
  const headers = {
    'Content-Type': 'application/json',
    Accept: accept,
    'User-Agent': ua,
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await proxyFetch(url, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {}
  return { status: res.status, headers: res.headers, text, json };
}

function extractProject(data) {
  if (!data || typeof data !== 'object') return '';
  for (const key of ['cloudaicompanionProject', 'projectId', 'project']) {
    const value = data[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
    if (value && typeof value === 'object' && typeof value.id === 'string' && value.id.trim()) return value.id.trim();
  }
  return '';
}

async function refreshVersion(force = false) {
  const now = Date.now();
  if (!force && state.antigravityVersion && now - state.versionFetchedAt < VERSION_TTL_MS) {
    versionInfo = { version: state.antigravityVersion, source: 'cache', fetchedAt: state.versionFetchedAt };
    return versionInfo;
  }
  try {
    const res = await proxyFetch(VERSION.manifestUrl, {
      headers: { 'User-Agent': 'electron-builder', 'Cache-Control': 'no-cache' },
      signal: AbortSignal.timeout(10_000),
    });
    const text = await res.text();
    const version = res.status === 200 ? parseVersionManifest(text) : null;
    if (version) {
      state.antigravityVersion = version;
      state.versionFetchedAt = now;
      saveState();
      versionInfo = { version, source: 'manifest', fetchedAt: now };
      return versionInfo;
    }
    throw new Error(`manifest returned ${res.status}`);
  } catch {
    if (state.antigravityVersion && now - state.versionFetchedAt < VERSION_TTL_MS * 4) {
      versionInfo = { version: state.antigravityVersion, source: 'cache', fetchedAt: state.versionFetchedAt };
    } else {
      versionInfo = { version: VERSION.fallback, source: 'fallback', fetchedAt: now };
    }
    return versionInfo;
  }
}

function currentVersion() {
  return versionInfo.version || state.antigravityVersion || VERSION.fallback;
}

function hasToken() {
  const acc = getActiveAccount();
  return !!(acc?.tokens?.refresh_token || state.tokens?.refresh_token);
}

function getActiveAccount() {
  if (Array.isArray(state.accounts) && state.accounts.length) {
    return state.accounts.find((a) => a.id === state.activeAccountId) || state.accounts[0];
  }
  if (state.tokens) {
    return {
      id: state.email || 'primary',
      email: state.email,
      project: state.project,
      tier: state.tier,
      tokens: state.tokens,
    };
  }
  return null;
}

function syncActiveState() {
  const acc = getActiveAccount();
  if (acc) {
    state.tokens = acc.tokens;
    state.email = acc.email;
    state.project = acc.project;
    state.tier = acc.tier;
  } else {
    state.tokens = null;
    state.email = null;
    state.project = null;
    state.tier = null;
  }
}

async function refreshAccountTokens(account) {
  const accId = account?.id || 'default';
  if (!account?.tokens?.refresh_token) {
    throw localizedError('not logged in', message('notLoggedIn'));
  }
  if (!refreshPromises.has(accId)) {
    const promise = (async () => {
      const ua = userAgents(currentVersion());
      const res = await proxyFetch(OAUTH.tokenEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Host: 'oauth2.googleapis.com',
          'User-Agent': ua.refresh,
        },
        body: tokenRefreshForm(account.tokens.refresh_token).toString(),
        signal: AbortSignal.timeout(15_000),
      });
      const text = await res.text();
      if (res.status === 400) {
        account.tokens = null;
        syncActiveState();
        saveState();
        throw localizedError(`refresh rejected (${res.status}): ${text.slice(0, 200)}`, message('refreshRejected', { status: res.status, text: text.slice(0, 200) }));
      }
      if (!res.ok) throw localizedError(`token refresh failed (${res.status}): ${text.slice(0, 200)}`, message('refreshFailed', { status: res.status, text: text.slice(0, 200) }));
      let json;
      try {
        json = JSON.parse(text);
      } catch {
        throw localizedError('token refresh returned non-JSON response', message('refreshJson', {}));
      }
      account.tokens = {
        access_token: json.access_token,
        refresh_token: json.refresh_token || account.tokens.refresh_token,
        expiresAt: Date.now() + (Number(json.expires_in) || 3600) * 1000,
      };
      syncActiveState();
      saveState();
      return account.tokens.access_token;
    })().finally(() => {
      refreshPromises.delete(accId);
    });
    refreshPromises.set(accId, promise);
  }
  return refreshPromises.get(accId);
}

async function ensureAccountAccessToken(account) {
  if (!account?.tokens?.refresh_token) throw localizedError('not logged in', message('notLoggedIn'));
  if (account.tokens.access_token && Date.now() < (account.tokens.expiresAt ?? 0) - TOKEN_SKEW_MS) {
    return account.tokens.access_token;
  }
  return refreshAccountTokens(account);
}

async function refreshTokens() {
  const acc = getActiveAccount();
  return refreshAccountTokens(acc);
}

async function ensureAccessToken() {
  const acc = getActiveAccount();
  return ensureAccountAccessToken(acc);
}

async function fetchUserInfo(token) {
  const ua = userAgents(currentVersion());
  const res = await upstreamJson(OAUTH.userinfoEndpoint, { method: 'GET', token, ua: ua.short });
  if (res.status !== 200 || !res.json?.email) throw localizedError(`userinfo failed (${res.status})`, message('userinfo', { status: res.status }));
  return res.json.email;
}

async function loadCodeAssist(token) {
  const ua = userAgents(currentVersion());
  const res = await upstreamJson(`${baseURLs().load}${API.loadCodeAssistPath}`, {
    token,
    ua: ua.short,
    body: { metadata: { ideType: 'ANTIGRAVITY' } },
  });
  if (res.status !== 200) throw localizedError(`loadCodeAssist failed (${res.status}): ${res.text.slice(0, 200)}`, message('loadFailed', { status: res.status, text: res.text.slice(0, 200) }));
  return res.json || {};
}

async function onboardUser(token, tierId) {
  const ua = userAgents(currentVersion());
  const base = baseURLs().onboard;
  for (let attempt = 0; attempt < 12; attempt++) {
    const res = await upstreamJson(`${base}${API.onboardUserPath}`, {
      token,
      ua: ua.long,
      body: { tier_id: tierId, cloudaicompanionProject: '', metadata: { ideType: 'ANTIGRAVITY' } },
      timeoutMs: 20000,
    });
    if (res.status !== 200) throw localizedError(`onboardUser failed (${res.status}): ${res.text.slice(0, 200)}`, message('onboardFailed', { status: res.status, text: res.text.slice(0, 200) }));
    const project = extractProject(res.json?.response) || extractProject(res.json);
    if (project) return project;
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw localizedError('onboardUser did not complete in time', message('onboardTimeout', {}));
}

async function fetchAvailableModels(token, project = null) {
  const ua = userAgents(currentVersion());
  const proj = project || state.project;
  const body = proj ? { project: proj } : {};
  let fetchedIds = [];
  for (const base of [API.prodBase, baseURLs().generate]) {
    try {
      const res = await upstreamJson(`${base}${API.fetchModelsPath}`, {
        token,
        ua: ua.short,
        body,
        timeoutMs: 20000,
      });
      if (res.status === 200 && res.json?.models) {
        const { ids, caps } = parseAvailableModels(res.json);
        if (ids.length) {
          state.modelCaps = { ...(state.modelCaps || {}), ...caps };
          fetchedIds = ids;
          break;
        }
      }
    } catch {}
  }
  const combined = Array.from(new Set([...fetchedIds, ...COMPREHENSIVE_GEMINI_MODELS]))
    .filter((id) => id && !/^(chat_|tab_)/.test(id));
  return combined;
}

async function completeLogin(code) {
  const ua = userAgents(currentVersion());
  const exchangeRes = await proxyFetch(OAUTH.tokenEndpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': ua.refresh,
    },
    body: tokenExchangeForm(code).toString(),
    signal: AbortSignal.timeout(15_000),
  });
  const exchangeText = await exchangeRes.text();
  if (!exchangeRes.ok) throw localizedError(`token exchange failed (${exchangeRes.status}): ${exchangeText.slice(0, 200)}`, message('exchangeFailed', { status: exchangeRes.status, text: exchangeText.slice(0, 200) }));
  const tokens = JSON.parse(exchangeText);
  const tokenData = {
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
    expiresAt: Date.now() + (Number(tokens.expires_in) || 3600) * 1000,
  };

  const email = await fetchUserInfo(tokens.access_token);
  const load = await loadCodeAssist(tokens.access_token);
  let project = extractProject(load);
  const tier = resolveTier(load);
  if (!project) {
    project = await onboardUser(tokens.access_token, tier);
  }

  if (!Array.isArray(state.accounts)) state.accounts = [];
  const existingIdx = state.accounts.findIndex((a) => a.email === email);
  const accountObj = {
    id: email,
    email,
    project,
    tier,
    tokens: tokenData,
  };
  if (existingIdx >= 0) {
    state.accounts[existingIdx] = accountObj;
  } else {
    state.accounts.push(accountObj);
  }
  state.activeAccountId = email;
  syncActiveState();

  try {
    state.models = await fetchAvailableModels(tokens.access_token, project);
  } catch {}

  saveState();

  try {
    state.providerSyncResult = syncProvider(loginOrigin);
  } catch (error) {
    state.providerSyncResult = { ok: false, reason: errorMessage(error) };
  }
  saveState();
}

function startLoginFlow(origin, lang) {
  stopLoginFlow();
  const stateToken = randomBytes(16).toString('hex');
  loginOrigin = typeof origin === 'string' ? origin : null;
  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? '/', 'http://localhost');
      if (url.pathname !== OAUTH.callbackPath) {
        res.writeHead(404).end();
        return;
      }
      const error = url.searchParams.get('error');
      const code = url.searchParams.get('code');
      const flowState = url.searchParams.get('state');
      const done = (ok, msg) => {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(callbackPage(ok, msg, loginFlow?.lang ?? resolveLang(req)));
      };
      try {
        if (error) return done(false, message('googleError', { error }));
        if (!code || flowState !== stateToken) return done(false, message('expired'));
        await completeLogin(code);
        return done(true, message('accountSummary', { email: state.email ?? '?', project: state.project ?? '?', tier: state.tier ?? '?' }));
      } catch (err) {
        return done(false, errorMessage(err));
      } finally {
        stopLoginFlow();
      }
    } catch (err) {
      try {
        res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end(String(err?.message ?? err));
      } catch {}
    }
  });

  server.on('error', () => {
    loginFlow = null;
  });

  loginFlow = { state: stateToken, server, lang, timer: null };
  return new Promise((resolve) => {
    server.listen(OAUTH.callbackPort, '127.0.0.1', () => {
      loginFlow.timer = setTimeout(() => stopLoginFlow(), LOGIN_TIMEOUT_MS);
      resolve({ authUrl: buildAuthUrl(stateToken), pending: true });
    });
    server.once('error', (error) => {
      loginFlow = null;
      resolve({
        error:
          error?.code === 'EADDRINUSE'
            ? message('portBusy', { port: OAUTH.callbackPort })
            : String(error?.message ?? error),
      });
    });
  });
}

function stopLoginFlow() {
  if (!loginFlow) return;
  if (loginFlow.timer) clearTimeout(loginFlow.timer);
  try {
    loginFlow.server.close();
  } catch {}
  loginFlow = null;
  loginOrigin = null;
}

async function logout(accountId = null) {
  stopLoginFlow();
  if (accountId && Array.isArray(state.accounts)) {
    state.accounts = state.accounts.filter((a) => a.id !== accountId);
    if (state.activeAccountId === accountId) {
      state.activeAccountId = state.accounts[0]?.id || null;
    }
  } else {
    state.accounts = [];
    state.activeAccountId = null;
  }
  syncActiveState();
  saveState();
}

// ---------------------------------------------------------------------------
// Rate-limit cooldowns & Multi-account selection
// ---------------------------------------------------------------------------

function parseRetryDelay(text, headers) {
  if (headers) {
    const retryAfter = Number(headers.get('retry-after'));
    if (Number.isFinite(retryAfter) && retryAfter > 0) return retryAfter * 1000;
  }
  const m = typeof text === 'string' ? text.match(/retryDelay["':\s]+(\d+)s/i) || text.match(/"retryDelay"\s*:\s*"(\d+)s"/) : null;
  if (m) return Number(m[1]) * 1000;
  return null;
}

function markAccountCooldown(accountId, model, ms) {
  const until = Date.now() + Math.max(1000, Math.min(ms, 30 * 60 * 1000));
  if (accountId) cooldowns.set(`${accountId}:${model}`, until);
  cooldowns.set(model, until);
  return until;
}

function getAccountCooldown(accountId, model) {
  if (accountId) {
    const until = cooldowns.get(`${accountId}:${model}`);
    if (until && until > Date.now()) return until;
  }
  return null;
}

function getAvailableAccount(model) {
  if (!Array.isArray(state.accounts) || !state.accounts.length) {
    const acc = getActiveAccount();
    return acc;
  }
  const active = state.accounts.find((a) => a.id === state.activeAccountId) || state.accounts[0];
  const activeCool = getAccountCooldown(active?.id, model);
  if (active && !activeCool) return active;

  for (const acc of state.accounts) {
    const cool = getAccountCooldown(acc.id, model);
    if (!cool) return acc;
  }
  return active;
}

// ---------------------------------------------------------------------------
// The OpenAI-compatible bridge
// ---------------------------------------------------------------------------

function openaiError(res, status, messageStr, code) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: { message: messageStr, type: status === 429 ? 'rate_limit_error' : 'api_error', code: code ?? null } }));
}

function checkApiKey(req) {
  if (!state.apiKey) return true;
  const auth = req.headers.authorization ?? '';
  return auth === `Bearer ${state.apiKey}`;
}

async function handleChat(req, res, body, lang) {
  if (!body || typeof body !== 'object' || !Array.isArray(body.messages)) {
    return openaiError(res, 400, 'body.messages must be an array', 'invalid_request');
  }

  const requestedModel = typeof body.model === 'string' && body.model ? body.model : DEFAULT_MODELS[0];
  const model = resolveModelName(requestedModel, state.models || DEFAULT_MODELS, state.apiConfig?.aliases, body.reasoning_effort);

  const cap = state.modelCaps?.[model]?.maxCompletionTokens;
  if (Number.isFinite(cap) && (!Number.isFinite(body.max_tokens) || body.max_tokens > cap)) {
    body = { ...body, max_tokens: cap };
  }

  const version = currentVersion();
  const ua = userAgents(version);
  const { request, sessionId } = await openaiToGeminiRequest(body, {
    getSignature: (id) => signatureStore.get(id),
    fetchImage: (url, opts) => proxyFetch(url, opts),
  });

  const stream = body.stream === true;
  const base = baseURLs().generate;
  const url = `${base}${stream ? API.streamPath + '?alt=sse' : API.generatePath}`;

  const controller = new AbortController();
  let clientGone = false;
  req.on('close', () => {
    if (!res.writableEnded) {
      clientGone = true;
      controller.abort();
    }
  });

  let currentAccount = getAvailableAccount(model);
  if (!currentAccount || !currentAccount.tokens?.refresh_token) {
    return openaiError(res, 401, renderMessage(message('notLoggedIn'), lang), 'not_logged_in');
  }

  const activeCool = getAccountCooldown(currentAccount?.id, model);
  if (activeCool && Date.now() < activeCool) {
    res.setHeader('Retry-After', Math.ceil((activeCool - Date.now()) / 1000));
    return openaiError(res, 429, `Model "${model}" is in quota cooldown until ${new Date(activeCool).toISOString()}`, 'rate_limit');
  }

  let attempt = 0;
  const maxAttempts = Math.max(2, (state.accounts?.length || 1) + 1);

  for (;;) {
    attempt += 1;
    let token;
    try {
      token = await ensureAccountAccessToken(currentAccount);
    } catch (error) {
      return openaiError(res, 401, renderMessage(errorMessage(error), lang), 'not_logged_in');
    }

    const envelope = antigravityEnvelope(model, currentAccount.project ?? state.project ?? '', request, sessionId);
    let upstream;
    try {
      upstream = await proxyFetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          'User-Agent': ua.short,
        },
        body: JSON.stringify(envelope),
        signal: controller.signal,
      });
    } catch (error) {
      if (clientGone || controller.signal.aborted) return;
      return openaiError(res, 502, `Upstream fetch failed: ${String(error?.message ?? error)}`, 'upstream');
    }

    if (upstream.status === 401 && attempt === 1) {
      try {
        await refreshAccountTokens(currentAccount);
        continue;
      } catch (error) {
        return openaiError(res, 401, renderMessage(errorMessage(error), lang), 'not_logged_in');
      }
    }

    if (upstream.status === 429) {
      const text = await upstream.text().catch(() => '');
      const delay = parseRetryDelay(text, upstream.headers) ?? 10 * 60 * 1000;
      const until = markAccountCooldown(currentAccount.id, model, delay);

      // Multi-account failover: look for another account
      if (Array.isArray(state.accounts) && state.accounts.length > 1) {
        const nextAccount = state.accounts.find((a) => a.id !== currentAccount.id && !getAccountCooldown(a.id, model));
        if (nextAccount && attempt < maxAttempts) {
          currentAccount = nextAccount;
          continue;
        }
      }

      res.setHeader('Retry-After', Math.ceil((until - Date.now()) / 1000));
      return openaiError(res, 429, `Google quota limit exceeded for "${model}": ${text.slice(0, 300)}`, 'rate_limit');
    }

    if (!upstream.ok) {
      const text = await upstream.text().catch(() => '');
      let errJson = null;
      try { errJson = JSON.parse(text); } catch {}
      const valUrl = errJson?.error?.details?.[0]?.metadata?.validation_url || errJson?.error?.details?.[1]?.links?.[0]?.url;
      if (valUrl) {
        state.validationUrl = valUrl;
        saveState();
        return openaiError(res, 403, `Google requires account verification: ${valUrl}`, 'validation_required');
      }
      const status = upstream.status >= 500 ? 502 : upstream.status;
      return openaiError(res, status, `Upstream error ${upstream.status}: ${text.slice(0, 500)}`, 'upstream');
    }

    if (state.validationUrl) {
      state.validationUrl = null;
      saveState();
    }

    if (!stream) return pipeNonStream(res, upstream, model, sessionId);
    return pipeStream(req, res, upstream, model, sessionId);
  }
}

async function pipeNonStream(res, upstream, model, sessionId) {
  const text = await upstream.text();
  let data = null;
  try {
    data = JSON.parse(text);
  } catch {}
  const gem = unwrapStreamChunk(data);
  const translateState = freshTranslateState({ stream: false, idSeed: sessionId });
  if (gem) geminiToOpenaiFragments(gem, translateState);
  for (const [id, signature] of translateState.signaturesById) rememberSignature(id, signature);
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(assembleNonStreamResponse(translateState, model)));
}

async function pipeStream(req, res, upstream, model, sessionId) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  });
  const completionId = openaiCompletionId();
  const created = Math.floor(Date.now() / 1000);
  const translateState = freshTranslateState({ stream: true, idSeed: sessionId });
  let first = true;

  const send = (payload) => {
    res.write(`data: ${JSON.stringify(payload)}\n\n`);
  };
  let sentFinish = false;
  const sendDelta = (fragment) => {
    const delta = { ...(first ? { role: 'assistant' } : {}), ...fragment.delta };
    first = false;
    if (fragment.finish_reason) sentFinish = true;
    const chunk = {
      id: completionId,
      object: 'chat.completion.chunk',
      created,
      model,
      choices: [{ index: 0, delta, finish_reason: fragment.finish_reason ?? null }],
    };
    if (fragment.usage) chunk.usage = fragment.usage;
    send(chunk);
  };

  const decoder = new TextDecoder();
  let buffer = '';
  try {
    for await (const chunk of upstream.body) {
      buffer += decoder.decode(chunk, { stream: true });
      const { events, rest } = extractSseEvents(buffer);
      buffer = rest;
      for (const event of events) {
        if (!event || event === '[DONE]') continue;
        let obj;
        try {
          obj = JSON.parse(event);
        } catch {
          continue;
        }
        const gem = unwrapStreamChunk(obj);
        if (!gem) continue;
        for (const fragment of geminiToOpenaiFragments(gem, translateState)) sendDelta(fragment);
      }
    }
  } catch (error) {
    console.error('[gemini-oauth-bridge] stream error:', String(error?.message ?? error));
    try {
      if (!res.writableEnded) {
        res.write(`data: ${JSON.stringify({ error: { message: `Stream aborted: ${error?.message ?? error}`, type: 'upstream_error' } })}\n\n`);
        res.write('data: [DONE]\n\n');
        res.end();
      }
    } catch {}
    return;
  }
  for (const [id, signature] of translateState.signaturesById) rememberSignature(id, signature);
  if (!res.writableEnded) {
    if (!sentFinish) {
      sendDelta({ delta: {}, finish_reason: 'stop', usage: translateState.usage });
    }
    res.write('data: [DONE]\n\n');
    res.end();
  }
}

// ---------------------------------------------------------------------------
// HTTP plumbing
// ---------------------------------------------------------------------------

function json(res, code, value) {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(value));
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
  } catch {
    return {};
  }
}

function ensureCredential() {
  let text = '';
  try {
    text = readFileSync(CREDENTIALS_PATH, 'utf8');
  } catch {}
  const merged = mergeCredentialYaml(text, PROVIDER_API_KEY_ENV, PROVIDER_PLACEHOLDER_KEY);
  if (!merged.ok) return { ok: false, reason: message('credentialMerge') };
  if (!merged.created) return { ok: true, created: false };
  try {
    mkdirSync(dirname(CREDENTIALS_PATH), { recursive: true });
    const tmp = CREDENTIALS_PATH + '.tmp';
    writeFileSync(tmp, merged.text, { encoding: 'utf8', mode: 0o600 });
    renameSync(tmp, CREDENTIALS_PATH);
  } catch (error) {
    return { ok: false, reason: errorMessage(error) };
  }
  return { ok: true, created: true };
}

function syncProvider(origin) {
  if (state.providerSync === false) return { ok: false, skipped: true, reason: message('disabled') };
  const ids = COMPREHENSIVE_GEMINI_MODELS;
  if (!ids.length) return { ok: false, reason: message('noModels') };
  let host = '127.0.0.1:3080';
  if (typeof origin === 'string') {
    const h = origin.replace(/^https?:\/\//, '').split('/')[0];
    if (/^(127\.0\.0\.1|localhost|\[::1\])(:\d+)?$/.test(h)) host = h;
  }
  const lines = buildProviderYamlLines(host, ids);
  let text = '';
  try {
    text = readFileSync(SETTINGS_PATH, 'utf8');
  } catch {}
  const firstWrite = !text;
  const merged = mergeProviderYaml(text || '', PROVIDER_NAME, lines);
  if (!merged.ok) return { ok: false, reason: message('providerMerge') };
  if (!firstWrite && !existsSync(SETTINGS_BACKUP)) {
    try {
      writeFileSync(SETTINGS_BACKUP, text, 'utf8');
    } catch {}
  }
  mkdirSync(dirname(SETTINGS_PATH), { recursive: true });
  const tmp = SETTINGS_PATH + '.tmp';
  writeFileSync(tmp, merged.text, 'utf8');
  renameSync(tmp, SETTINGS_PATH);
  const credential = ensureCredential();
  state.providerSyncResult = { at: Date.now(), models: ids.length, host, credential };
  saveState();
  return {
    ok: true,
    models: ids.length,
    host,
    apiKeyEnv: PROVIDER_API_KEY_ENV,
    credential,
    backup: !firstWrite && existsSync(SETTINGS_BACKUP),
  };
}

function statusPayload() {
  const activeAccount = getActiveAccount();
  const allModels = COMPREHENSIVE_GEMINI_MODELS;

  return {
    ok: true,
    loggedIn: hasToken(),
    email: activeAccount?.email || state.email,
    project: activeAccount?.project || state.project,
    tier: activeAccount?.tier || state.tier,
    accounts: (state.accounts || []).map((a) => ({
      id: a.id,
      email: a.email,
      project: a.project,
      tier: a.tier,
      isActive: a.id === state.activeAccountId,
      hasToken: !!(a.tokens && a.tokens.refresh_token),
      cooldowns: Object.fromEntries(
        [...cooldowns.entries()]
          .filter(([k, until]) => k.startsWith(`${a.id}:`) && until > Date.now())
          .map(([k, until]) => [k.slice(a.id.length + 1), until])
      ),
    })),
    activeAccountId: state.activeAccountId,
    models: allModels,
    aliases: DEFAULT_MODEL_ALIASES,
    modelSource: state.models ? 'upstream' : 'default',
    version: currentVersion(),
    versionSource: versionInfo.source,
    loginPending: !!loginFlow,
    providerSync: state.providerSyncResult,
    tokenExpiresAt: activeAccount?.tokens?.expiresAt ?? state.tokens?.expiresAt ?? null,
    signatureCount: signatureStore.size,
    unblock: getUnblockStatus(),
    connectionMode: state.apiConfig?.connectionMode || (state.apiConfig?.proxy ? 'proxy' : 'auto'),
    proxy: state.apiConfig?.proxy || resolveProxyUrl() || '',
    proxyConfigured: !!(state.apiConfig?.proxy || resolveProxyUrl()),
    cooldowns: Object.fromEntries([...cooldowns.entries()].filter(([, until]) => until > Date.now())),
    validationUrl: state.validationUrl || null,
    apiConfig: state.apiConfig ?? {},
  };
}

export function apply(ctx) {
  void refreshVersion();

  const route = ctx.webServer.register({
    kind: 'prefix',
    path: '/gemini-oauth-bridge',
    async handler(req, res) {
      const url = new URL(req.url, 'http://localhost');
      const path = url.pathname;
      const lang = resolveLang(req);
      const reply = (code, value) => json(res, code, renderPayload(value, lang));
      try {
        // --- Settings UI API ---
        if (path === '/gemini-oauth-bridge/api/ping' && req.method === 'GET') {
          return reply(200, { ok: true, version: 2 });
        }
        if (path === '/gemini-oauth-bridge/api/status' && req.method === 'GET') {
          return reply(200, statusPayload());
        }
        if (path === '/gemini-oauth-bridge/api/login' && req.method === 'POST') {
          const result = await startLoginFlow(req.headers.host ? `http://${req.headers.host}` : null, lang);
          return reply(result.error ? 503 : 200, result);
        }
        if (path === '/gemini-oauth-bridge/api/cancel-login' && req.method === 'POST') {
          stopLoginFlow();
          return reply(200, { ok: true, message: message('loginCancelled') });
        }
        if (path === '/gemini-oauth-bridge/api/logout' && req.method === 'POST') {
          const body = await readBody(req);
          await logout(body.accountId || null);
          return reply(200, { ok: true });
        }
        if (path === '/gemini-oauth-bridge/api/switch-account' && req.method === 'POST') {
          const body = await readBody(req);
          if (body.id && state.accounts?.some((a) => a.id === body.id)) {
            state.activeAccountId = body.id;
            syncActiveState();
            saveState();
            return reply(200, { ok: true, activeAccountId: state.activeAccountId });
          }
          return reply(400, { error: 'Account not found' });
        }
        if (path === '/gemini-oauth-bridge/api/remove-account' && req.method === 'POST') {
          const body = await readBody(req);
          if (body.id) {
            await logout(body.id);
            return reply(200, { ok: true, message: message('accountRemoved', { email: body.id }) });
          }
          return reply(400, { error: 'Missing account id' });
        }
        if (path === '/gemini-oauth-bridge/api/save-proxy' && req.method === 'POST') {
          const body = await readBody(req);
          state.apiConfig = { ...state.apiConfig, proxy: typeof body.proxy === 'string' ? body.proxy.trim() : null };
          saveState();
          return reply(200, { ok: true, proxy: state.apiConfig.proxy, message: message('proxySaved') });
        }
        if (path === '/gemini-oauth-bridge/api/test-proxy' && req.method === 'POST') {
          const body = await readBody(req);
          const p = typeof body.proxy === 'string' ? body.proxy.trim() : state.apiConfig?.proxy;
          const result = await testConnection(p, 'proxy');
          return reply(result.ok ? 200 : 502, result);
        }
        if (path === '/gemini-oauth-bridge/api/set-connection-mode' && req.method === 'POST') {
          const body = await readBody(req);
          const mode = ['auto', 'direct', 'proxy'].includes(body.mode) ? body.mode : 'auto';
          const proxy = typeof body.proxy === 'string' ? body.proxy.trim() : (body.proxy === null ? null : (state.apiConfig?.proxy || null));
          state.apiConfig = { ...state.apiConfig, connectionMode: mode, proxy };
          saveState();
          return reply(200, { ok: true, connectionMode: mode, proxy, unblock: getUnblockStatus() });
        }
        if (path === '/gemini-oauth-bridge/api/test-connection' && req.method === 'POST') {
          const body = await readBody(req);
          const mode = body.mode || state.apiConfig?.connectionMode || 'auto';
          const proxy = body.proxy !== undefined ? body.proxy : state.apiConfig?.proxy;
          const result = await testConnection(proxy, mode);
          return reply(result.ok ? 200 : 502, result);
        }
        if (path === '/gemini-oauth-bridge/api/refresh-unblock' && req.method === 'POST') {
          const status = await refreshProxies();
          return reply(200, { ok: true, unblock: status });
        }

        // --- Анлокер: DNS-пин + бинарный патч ---
        if (path === '/gemini-oauth-bridge/api/unlock-status' && req.method === 'GET') {
          const dnsPinStatus = getDnsPinStatus();
          const binaryStatus = getBinaryPatchStatus();
          const watchdog = getWatchdogStatus();
          return reply(200, { ok: true, dnsPinStatus, binaryStatus, watchdog });
        }
        if (path === '/gemini-oauth-bridge/api/dns-pin' && req.method === 'POST') {
          const logs = [];
          try {
            const result = await runDnsPin((msg) => logs.push(msg));
            if (result.needSudo) return reply(403, { ok: false, error: renderMessage(message('needSudo'), lang), logs });
            const ok2 = result.pinned.length > 0;
            const msg = ok2
              ? message('dnsPinDone', { count: result.pinned.length })
              : message('dnsPinFailed', { error: result.errors.join('; ') || 'нет подмены' });
            return reply(ok2 ? 200 : 502, { ok: ok2, result, logs, message: msg });
          } catch (err) {
            return reply(502, { ok: false, error: err.message, logs });
          }
        }
        if (path === '/gemini-oauth-bridge/api/dns-pin-remove' && req.method === 'POST') {
          const result = removeDnsPin();
          return reply(result.ok ? 200 : 502, { ...result, message: result.ok ? message('dnsPinRemoved') : result.error });
        }
        if (path === '/gemini-oauth-bridge/api/binary-patch' && req.method === 'POST') {
          const logs = [];
          try {
            const result = await runBinaryPatch((msg) => logs.push(msg));
            if (result.needSudo) return reply(403, { ok: false, error: renderMessage(message('needSudo'), lang), logs });
            const ok2 = result.errors.length === 0;
            const msg = ok2 ? message('binaryPatchDone') : message('binaryPatchFailed', { error: result.errors.join('; ') });
            return reply(ok2 ? 200 : 207, { ok: ok2, result, logs, message: msg });
          } catch (err) {
            return reply(502, { ok: false, error: err.message, logs });
          }
        }
        if (path === '/gemini-oauth-bridge/api/binary-revert' && req.method === 'POST') {
          const logs = [];
          try {
            const result = await revertBinaryPatch((msg) => logs.push(msg));
            return reply(200, { ok: true, result, logs, message: message('binaryReverted') });
          } catch (err) {
            return reply(502, { ok: false, error: err.message, logs });
          }
        }
        if (path === '/gemini-oauth-bridge/api/unlock-all' && req.method === 'POST') {
          const logs = [];
          try {
            logs.push('=== Бинарный патч ===');
            const binResult = await runBinaryPatch((msg) => logs.push(msg));
            logs.push('=== DNS-пин ===');
            const dnsResult = await runDnsPin((msg) => logs.push(msg));
            if (binResult.needSudo || dnsResult.needSudo) {
              return reply(403, { ok: false, error: renderMessage(message('needSudo'), lang), logs });
            }
            const ok2 = dnsResult.pinned.length > 0;
            return reply(ok2 ? 200 : 207, { ok: ok2, binResult, dnsResult, logs, message: ok2 ? message('unlockDone') : message('unlockFailed', { error: 'DNS-пин не удался' }) });
          } catch (err) {
            return reply(502, { ok: false, error: err.message, logs });
          }
        }
        if (path === '/gemini-oauth-bridge/api/watchdog-install' && req.method === 'POST') {
          const result = installWatchdog();
          return reply(result.ok ? 200 : 502, result);
        }
        if (path === '/gemini-oauth-bridge/api/watchdog-remove' && req.method === 'POST') {
          const result = uninstallWatchdog();
          return reply(result.ok ? 200 : 502, result);
        }
        if (path === '/gemini-oauth-bridge/api/refresh-models' && req.method === 'POST') {
          if (!hasToken()) return reply(400, { error: message('notLoggedIn') });
          try {
            const token = await ensureAccessToken();
            state.models = await fetchAvailableModels(token);
            saveState();
          } catch (error) {
            return reply(502, { error: errorMessage(error) });
          }
          let provider;
          try {
            provider = syncProvider(req.headers.host ? `http://${req.headers.host}` : null);
          } catch (error) {
            provider = { ok: false, reason: errorMessage(error) };
          }
          state.providerSyncResult = provider;
          saveState();
          return reply(200, { ok: true, models: state.models, provider });
        }
        if (path === '/gemini-oauth-bridge/api/refresh-version' && req.method === 'POST') {
          const info = await refreshVersion(true);
          return reply(200, info);
        }

        // --- OpenAI-compatible bridge (consumed by DSH providers) ---
        if (!checkApiKey(req)) return openaiError(res, 401, 'invalid bridge API key', 'unauthorized');
        if (path === '/gemini-oauth-bridge/v1/models' && req.method === 'GET') {
          const models = COMPREHENSIVE_GEMINI_MODELS;
          const created = Math.floor(Date.now() / 1000);
          return json(res, 200, {
            object: 'list',
            data: models.map((id) => ({ id, object: 'model', created, owned_by: 'google' })),
          });
        }
        if (path === '/gemini-oauth-bridge/v1/chat/completions' && req.method === 'POST') {
          const body = await readBody(req);
          return await handleChat(req, res, body, lang);
        }

        // --- Root: human-readable summary ---
        if (path.startsWith('/gemini-oauth-bridge/images/') && req.method === 'GET') {
          const filename = path.replace('/gemini-oauth-bridge/images/', '');
          const imgPath = join('/tmp/dsh-images', filename);
          if (existsSync(imgPath)) {
            const buf = readFileSync(imgPath);
            res.writeHead(200, { 'Content-Type': 'image/jpeg', 'Access-Control-Allow-Origin': '*' });
            return res.end(buf);
          }
          res.writeHead(404).end();
          return;
        }

        if (path === '/gemini-oauth-bridge' || path === '/gemini-oauth-bridge/') {
          const st = statusPayload();
          const dnsPinSt = getDnsPinStatus();
          const binSt = getBinaryPatchStatus();
          const wdSt = getWatchdogStatus();
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
          const t = (key, params) => escapeHtml(renderMessage(message(key, params), lang));
          const btn = (label, api, color = '#238636') =>
            `<button onclick="act('${api}')" style="margin:4px 4px 4px 0;padding:7px 14px;background:${color};color:#fff;border:0;border-radius:6px;cursor:pointer;font-size:13px">${label}</button>`;
          const pinEntries = dnsPinSt.pinned
            ? dnsPinSt.entries.map(e => `<code>${e.ip} ${e.domain}</code>`).join('<br>')
            : '—';
          const binEntries = binSt.length
            ? binSt.map(b => `<code>${b.file}: ${b.patched ? '✅ пропатчен' : b.error ? '❌ ошибка' : '⚠️ не пропатчен'}</code>`).join('<br>')
            : '<em>Antigravity/agy не найдены</em>';
          return res.end(
            `<!doctype html><html lang="${lang}"><meta charset="utf-8"><title>gemini-oauth-bridge</title>` +
              `<body style="font-family:system-ui,-apple-system,BlinkMacSystemFont,sans-serif;padding:40px;background:#0d1117;color:#c9d1d9">` +
              `<div style="max-width:660px;margin:0 auto;background:#161b22;padding:32px;border-radius:12px;border:1px solid #30363d">` +
              `<h2 style="margin-top:0">dsh-gemini-oauth-bridge</h2><ul>` +
              `<li>${t('login', { value: st.loggedIn ? `✅ ${st.email}` : renderMessage(message('loggedOut'), lang) })}</li>` +
              `<li>${t('project', { project: st.project ?? '-', tier: st.tier ?? '-' })}</li>` +
              `<li>${t('version', { version: st.version, source: renderMessage(message(`source_${st.versionSource}`), lang) })}</li>` +
              `<li>${t('models', { models: st.models.join(', '), source: renderMessage(message(`source_${st.modelSource}`), lang) })}</li>` +
              `<li>Подключено аккаунтов: ${st.accounts?.length || (st.loggedIn ? 1 : 0)}</li>` +
              `</ul>` +
              `<hr style="border-color:#30363d;margin:20px 0">` +
              `<h3 style="margin:0 0 12px">🔓 AG Unlocker (DNS-пин + бинарный патч)</h3>` +
              `<p style="font-size:13px;color:#8b949e;margin:0 0 12px">Порт <a href="https://github.com/Asalio123/antigravity-unlocker" style="color:#58a6ff">Asalio123/antigravity-unlocker</a>. Нужен sudo без пароля (<code>NOPASSWD</code>) или запуск DSH через sudo.</p>` +
              `<div style="margin-bottom:14px">` +
              `${btn('🚀 Полный анлок (DNS + патч)', 'unlock-all')}` +
              `${btn('🌐 Только DNS-пин', 'dns-pin')}` +
              `${btn('🔧 Только бинарный патч', 'binary-patch')}` +
              `</div>` +
              `<div style="margin-bottom:14px">` +
              `${btn('↩ Удалить DNS-пин', 'dns-pin-remove', '#6e40c9')}` +
              `${btn('↩ Откатить бинарный патч', 'binary-revert', '#6e40c9')}` +
              `${wdSt.installed ? btn('🐾 Watchdog: ВЫКЛ', 'watchdog-remove', '#b62324') : btn('🐾 Watchdog: ВКЛ', 'watchdog-install', '#1a7f37')}` +
              `</div>` +
              `<div id="log" style="background:#0d1117;border:1px solid #30363d;border-radius:6px;padding:12px;font-size:12px;font-family:monospace;min-height:40px;white-space:pre-wrap;max-height:200px;overflow-y:auto"></div>` +
              `<div style="margin-top:16px;font-size:13px">` +
              `<b>DNS-пин:</b> ${dnsPinSt.pinned ? '✅ установлен' : '⬜ не установлен'}<br>${pinEntries}<br><br>` +
              `<b>Бинарный патч:</b><br>${binEntries}` +
              `</div>` +
              `<p style="margin-top:20px">${t('endpoint')}<code>/gemini-oauth-bridge/v1</code></p>` +
              `</div>` +
              `<script>
async function act(api) {
  const log = document.getElementById('log');
  log.textContent = 'Выполняю...';
  try {
    const r = await fetch('/gemini-oauth-bridge/api/' + api, { method: 'POST', headers: { 'Content-Type': 'application/json' } });
    const j = await r.json();
    const lines = [];
    if (j.logs) lines.push(...j.logs);
    if (j.message) lines.push('→ ' + (typeof j.message === 'string' ? j.message : JSON.stringify(j.message)));
    if (j.error) lines.push('❌ ' + (typeof j.error === 'string' ? j.error : JSON.stringify(j.error)));
    log.textContent = lines.join('\\n') || JSON.stringify(j, null, 2);
    setTimeout(() => location.reload(), 2000);
  } catch(e) { log.textContent = 'Ошибка: ' + e.message; }
}
</script>` +
              `</body></html>`,
          );
          return;
        }

        res.writeHead(404);
        res.end();
      } catch (error) {
        try {
          json(res, 500, { error: renderMessage(errorMessage(error), lang) });
        } catch {}
      }
    },
  });

  ctx.effect(() => {
    stopLoginFlow();
    if (signatureSaveTimer) {
      clearTimeout(signatureSaveTimer);
      signatureSaveTimer = null;
      saveState();
    }
    return route;
  });
}
