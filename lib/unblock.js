// lib/unblock.js — встроенный авто-обход блокировок Google Gemini API (SNI Reverse Proxy).
//
// Работает полностью внутри Node.js без sudo, без правки /etc/hosts и без внешнего VPN.
// Кроссплатформенный: macOS, Linux (включая Steam Deck SteamOS), Windows.
//
// Метод: при обращении к заблокированным доменам Google AI (daily-cloudcode-pa, cloudcode-pa,
// generativelanguage) запросы направляются на проверенные узлы SNI reverse proxy с сохранением
// оригинального SNI (servername). Google отдаёт валидный TLS-сертификат, а ТСПУ/РКН и гео-блокировки
// обходятся автоматически.

import https from 'node:https';
import dns from 'node:dns';

// Домены Google AI, требующие обхода
export const UNBLOCK_DOMAINS = new Set([
  'daily-cloudcode-pa.googleapis.com',
  'cloudcode-pa.googleapis.com',
  'generativelanguage.googleapis.com',
]);

// Проверенные стабильные узлы SNI reverse proxy
const SEED_PROXIES = [
  { ip: '37.221.93.141', name: 'RU-1 (Primary)', lastMs: 200, healthy: true, failures: 0 },
  { ip: '217.60.179.6',  name: 'EU-1 (DE)',       lastMs: 220, healthy: true, failures: 0 },
  { ip: '109.120.131.200', name: 'RU-2',          lastMs: 310, healthy: true, failures: 0 },
  { ip: '5.129.221.64',  name: 'RU-3 (Timeweb)',  lastMs: 850, healthy: true, failures: 0 },
];

let proxyPool = [...SEED_PROXIES];
let activeProxyIndex = 0;
let lastDiscoveryTime = 0;

/** Подсеть Google AS15169 (не является прокси) */
function isGoogleDirectIp(ip) {
  if (!ip || typeof ip !== 'string') return true;
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4) return true;
  // 142.250.0.0/15 (142.250 - 142.251)
  if (parts[0] === 142 && (parts[1] === 250 || parts[1] === 251)) return true;
  // 172.217.0.0/16
  if (parts[0] === 172 && parts[1] === 217) return true;
  // 216.58.0.0/16
  if (parts[0] === 216 && parts[1] === 58) return true;
  // 173.194.0.0/16
  if (parts[0] === 173 && parts[1] === 194) return true;
  // 74.125.0.0/16
  if (parts[0] === 74 && parts[1] === 125) return true;
  // 64.233.0.0/16
  if (parts[0] === 64 && parts[1] === 233) return true;
  // 108.177.0.0/16
  if (parts[0] === 108 && parts[1] === 177) return true;
  // 209.85.0.0/16
  if (parts[0] === 209 && parts[1] === 85) return true;
  // 157.22.x.x (сбойный узел)
  if (parts[0] === 157 && parts[1] === 22) return true;
  return false;
}

/** Проверить доступность узла через TLS HEAD */
export function probeProxy(ip, domain = 'daily-cloudcode-pa.googleapis.com', timeoutMs = 3500) {
  return new Promise((resolve) => {
    const start = Date.now();
    const req = https.request({
      host: ip,
      servername: domain,
      path: '/',
      method: 'HEAD',
      headers: { host: domain, 'user-agent': 'antigravity/hub' },
      timeout: timeoutMs,
    }, (res) => {
      const ms = Date.now() - start;
      const ok = res.statusCode >= 200 && res.statusCode < 500;
      resolve({ ip, ok, status: res.statusCode, ms });
    });
    req.on('error', (err) => resolve({ ip, ok: false, error: err.message }));
    req.on('timeout', () => { req.destroy(); resolve({ ip, ok: false, error: 'timeout' }); });
    req.end();
  });
}

/** Получить текущий активный рабочий IP */
export function getActiveProxyIp() {
  const healthy = proxyPool.filter((p) => p.healthy);
  if (healthy.length > 0) {
    // Берём узел с наименьшим пингом
    healthy.sort((a, b) => a.lastMs - b.lastMs);
    return healthy[0].ip;
  }
  // Если все помечены нездоровыми, сбрасываем флаги и возвращаем первый seed
  for (const p of proxyPool) { p.healthy = true; p.failures = 0; }
  return SEED_PROXIES[0].ip;
}

/** Зафиксировать ошибку соединения с прокси */
export function markProxyFailure(ip) {
  const found = proxyPool.find((p) => p.ip === ip);
  if (found) {
    found.failures += 1;
    if (found.failures >= 2) {
      found.healthy = false;
      // В фоне проверяем снова через 3 минуты
      setTimeout(() => {
        probeProxy(ip).then((r) => {
          if (r.ok) { found.healthy = true; found.failures = 0; found.lastMs = r.ms; }
        });
      }, 3 * 60 * 1000);
    }
  }
}

/** Зафиксировать успешный запрос через прокси */
export function markProxySuccess(ip, ms) {
  const found = proxyPool.find((p) => p.ip === ip);
  if (found) {
    found.healthy = true;
    found.failures = 0;
    if (Number.isFinite(ms) && ms > 0) {
      found.lastMs = Math.round((found.lastMs * 0.7) + (ms * 0.3));
    }
  }
}

/** Custom lookup функция для https.Agent */
function unblockLookup(hostname, options, callback) {
  if (typeof options === 'function') {
    callback = options;
    options = {};
  }
  if (UNBLOCK_DOMAINS.has(hostname)) {
    const ip = getActiveProxyIp();
    if (options && options.all) {
      return callback(null, [{ address: ip, family: 4 }]);
    }
    return callback(null, ip, 4);
  }
  // Для всех остальных доменов (oauth2, accounts и т.д.) используем системный DNS
  return dns.lookup(hostname, options, callback);
}

// Постоянный агент с кастомным резолвером
let cachedAgent = null;

export function getUnblockAgent() {
  if (!cachedAgent) {
    cachedAgent = new https.Agent({
      keepAlive: true,
      maxSockets: 32,
      timeout: 30000,
      lookup: unblockLookup,
    });
  }
  return cachedAgent;
}

/** Получить детальный статус системы обхода */
export async function getUnblockStatus() {
  const activeIp = getActiveProxyIp();
  const current = proxyPool.find((p) => p.ip === activeIp);
  return {
    enabled: true,
    activeIp,
    activeName: current?.name || activeIp,
    latencyMs: current?.lastMs || null,
    proxies: proxyPool.map((p) => ({
      ip: p.ip,
      name: p.name,
      healthy: p.healthy,
      lastMs: p.lastMs,
    })),
  };
}

/** Проверить все прокси и обновить пинги */
export async function refreshProxies() {
  const results = await Promise.all(proxyPool.map((p) => probeProxy(p.ip)));
  for (const res of results) {
    const p = proxyPool.find((x) => x.ip === res.ip);
    if (p) {
      p.healthy = res.ok;
      if (res.ok) {
        p.lastMs = res.ms;
        p.failures = 0;
      }
    }
  }
  return getUnblockStatus();
}

/** Автоматическая фоновая проверка раз в 10 минут */
setInterval(() => {
  refreshProxies().catch(() => {});
}, 10 * 60 * 1000).unref();
