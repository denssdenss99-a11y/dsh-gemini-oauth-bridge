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

// Проверенные стабильные узлы SNI reverse proxy ("Переменный узел")
const SEED_PROXIES = [
  { ip: '37.221.93.141',   name: 'Node-1 (Fast RU)',   lastMs: 210, healthy: true, failures: 0, isSeed: true },
  { ip: '109.120.131.200', name: 'Node-2 (Stable RU)', lastMs: 310, healthy: true, failures: 0, isSeed: true },
  { ip: '193.233.112.88',  name: 'Node-3 (Relay)',     lastMs: 450, healthy: true, failures: 0, isSeed: true },
  { ip: '217.60.179.6',    name: 'Node-4 (EU DE)',     lastMs: 220, healthy: true, failures: 0, isSeed: true },
  { ip: '5.129.221.64',    name: 'Node-5 (Timeweb)',   lastMs: 650, healthy: true, failures: 0, isSeed: true },
];

let proxyPool = [...SEED_PROXIES];
let rrCounter = 0;

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
  // 157.22.x.x
  if (parts[0] === 157 && parts[1] === 22) return true;
  // Приватные / локальные
  if (parts[0] === 10 || parts[0] === 127 || (parts[0] === 192 && parts[1] === 168)) return true;
  return false;
}

/** Проверить доступность узла через TLS */
export function probeProxy(ip, domain = 'daily-cloudcode-pa.googleapis.com', timeoutMs = 4000) {
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

/** Динамическое обнаружение свежих прокси через unblock DNS */
const DNS_SERVERS = ['37.230.192.51', '212.109.195.93'];

async function discoverFreshNodes() {
  const discovered = new Set();
  for (const s of DNS_SERVERS) {
    const resolver = new dns.Resolver();
    resolver.setServers([s]);
    for (const host of ['daily-cloudcode-pa.googleapis.com', 'generativelanguage.googleapis.com']) {
      await new Promise((resolve) => {
        resolver.resolve4(host, (err, addrs) => {
          if (addrs) {
            for (const addr of addrs) {
              if (!isGoogleDirectIp(addr)) discovered.add(addr);
            }
          }
          resolve();
        });
      });
    }
  }

  for (const ip of discovered) {
    if (!proxyPool.some((p) => p.ip === ip)) {
      const probeRes = await probeProxy(ip);
      if (probeRes.ok) {
        proxyPool.push({
          ip,
          name: `Dynamic (${ip})`,
          lastMs: probeRes.ms,
          healthy: true,
          failures: 0,
          isSeed: false,
        });
      }
    }
  }
}

/** Получить текущий активный рабочий IP ("переменный узел" с ротацией среди лучших) */
export function getActiveProxyIp() {
  const healthy = proxyPool.filter((p) => p.healthy);
  if (healthy.length > 0) {
    healthy.sort((a, b) => (a.lastMs || 999) - (b.lastMs || 999));
    const topCount = Math.min(3, healthy.length);
    const chosen = healthy[(rrCounter++) % topCount];
    return chosen.ip;
  }
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
      setTimeout(() => {
        probeProxy(ip).then((r) => {
          if (r.ok) { found.healthy = true; found.failures = 0; found.lastMs = r.ms; }
        });
      }, 3 * 60 * 1000).unref();
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
  await discoverFreshNodes();
  const results = await Promise.all(proxyPool.map((p) => probeProxy(p.ip)));
  for (const res of results) {
    const p = proxyPool.find((x) => x.ip === res.ip);
    if (p) {
      p.healthy = res.ok;
      if (res.ok) {
        p.lastMs = res.ms;
        p.failures = 0;
      } else {
        p.failures += 1;
      }
    }
  }
  // Удаляем устаревшие динамические узлы с ошибками
  proxyPool = proxyPool.filter((p) => p.isSeed || p.failures < 3);
  return getUnblockStatus();
}

/** Автоматическая фоновая проверка раз в 10 минут */
setInterval(() => {
  refreshProxies().catch(() => {});
}, 10 * 60 * 1000).unref();
