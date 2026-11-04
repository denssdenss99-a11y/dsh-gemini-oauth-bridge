// lib/dns-pin.js — DNS-пин и бинарный патч из ag_unlocker_mac.sh (porт на Node.js)
//
// Порт логики: https://github.com/Asalio123/antigravity-unlocker
// Метод 1: DNS-пин — подмена записей для Google API-доменов через анблок-DNS-провайдеров
//           (geohide.ru / comss.one / dns-ai.ru) с записью в /etc/hosts + маршруты при VPN.
// Метод 2: Бинарный патч language_server / agy CLI: "ineligible" → "inexigible".
//
// Нужен sudo для записи /etc/hosts и route. Если прав нет — возвращает инструкцию.

import { execFileSync, spawnSync, execSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync, readdirSync, unlinkSync } from 'node:fs';
import { createConnection } from 'node:net';
import https from 'node:https';
import http from 'node:http';
import { homedir } from 'node:os';
import { join } from 'node:path';

// ---------------------------------------------------------------------------
// Константы
// ---------------------------------------------------------------------------

const MARKER_BEGIN = '# AG_UNLOCKER_HOSTS_BEGIN';
const MARKER_END   = '# AG_UNLOCKER_HOSTS_END';
const HOSTS_PATH   = '/etc/hosts';

const DOMAINS = [
  'daily-cloudcode-pa.googleapis.com',
  'generativelanguage.googleapis.com',
  'cloudcode-pa.googleapis.com',
];

// UDP-DNS провайдеры (без xbox-dns.ru — умер 07.10.2026)
const UDP_PROVIDERS = [
  '45.155.204.190',
  '37.230.192.51',
  '83.220.169.155',
  '212.109.195.93',
  '195.133.25.16',
];

// DoH-провайдеры: { host, ips[], http2 }
const DOH_PROVIDERS = [
  { host: 'dns.geohide.ru',  ips: ['37.230.192.51', '45.155.204.190'],                       h2: false },
  { host: 'dns.comss.one',   ips: ['83.220.169.155', '212.109.195.93', '195.133.25.16'],     h2: false },
  { host: 'dns.dns-ai.ru',   ips: ['192.144.59.14', '186.246.49.127', '185.251.90.181'],     h2: true  },
];

const REFERENCE_SERVERS = ['8.8.8.8', '1.1.1.1'];

// Пути к language_server и agy CLI
const AGY_CANDIDATES = [
  '/usr/local/bin/agy',
  `${homedir()}/.local/bin/agy`,
  `${homedir()}/bin/agy`,
];
const APP_CANDIDATES = [
  '/Applications/Antigravity.app',
  `${homedir()}/Applications/Antigravity.app`,
  '/Applications/Antigravity IDE.app',
  `${homedir()}/Applications/Antigravity IDE.app`,
];

// ---------------------------------------------------------------------------
// Вспомогательные: DNS-запросы
// ---------------------------------------------------------------------------

/** Запросить A-записи для домена у указанного DNS-сервера (UDP) */
function digA(domain, server, timeoutMs = 4000) {
  try {
    const r = spawnSync('dig', ['+short', '+time=4', '+tries=1', 'A', domain, `@${server}`], {
      timeout: timeoutMs, encoding: 'utf8',
    });
    if (r.status !== 0) return [];
    return (r.stdout || '')
      .split('\n')
      .map(l => l.trim())
      .filter(l => /^(\d{1,3}\.){3}\d{1,3}$/.test(l));
  } catch { return []; }
}

/** Эталонные /16-префиксы для домена (8.8.8.8 + 1.1.1.1) */
function referenceNet16s(domain) {
  const ips = new Set();
  for (const srv of REFERENCE_SERVERS) {
    for (const ip of digA(domain, srv)) {
      const parts = ip.split('.');
      ips.add(`${parts[0]}.${parts[1]}`);
    }
  }
  return ips;
}

/** Encode base64url DNS wire-format A-query */
function buildDnsWireQuery(domain) {
  const labels = domain.split('.');
  const qnameParts = [];
  for (const lbl of labels) {
    const buf = Buffer.from(lbl, 'utf8');
    qnameParts.push(Buffer.from([buf.length]), buf);
  }
  qnameParts.push(Buffer.from([0x00]));
  const qname = Buffer.concat(qnameParts);
  // header: id=0x1234, flags=QR=0 RD=1, QDCount=1
  const header = Buffer.from([0x12, 0x34, 0x01, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);
  const qtype  = Buffer.from([0x00, 0x01]); // A
  const qclass = Buffer.from([0x00, 0x01]); // IN
  const wire = Buffer.concat([header, qname, qtype, qclass]);
  return wire.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Разобрать A-записи из DNS wire-format ответа */
function parseDnsWireResponse(buf) {
  const ips = [];
  if (!Buffer.isBuffer(buf) || buf.length < 12) return ips;
  const qdCount = buf.readUInt16BE(4);
  const anCount = buf.readUInt16BE(6);
  let off = 12;
  // пропустить вопросы
  for (let i = 0; i < qdCount; i++) {
    while (off < buf.length) {
      const len = buf[off++];
      if (len === 0) break;
      if ((len & 0xc0) === 0xc0) { off++; break; }
      off += len;
    }
    off += 4; // qtype + qclass
  }
  // разобрать ответы
  for (let i = 0; i < anCount && off < buf.length; i++) {
    while (off < buf.length) {
      const len = buf[off++];
      if (len === 0) break;
      if ((len & 0xc0) === 0xc0) { off++; break; }
      off += len;
    }
    if (off + 10 > buf.length) break;
    const type   = buf.readUInt16BE(off);
    off += 8; // type, class, ttl
    const rdlen  = buf.readUInt16BE(off); off += 2;
    if (type === 1 && rdlen === 4 && off + 4 <= buf.length) {
      ips.push(`${buf[off]}.${buf[off+1]}.${buf[off+2]}.${buf[off+3]}`);
    }
    off += rdlen;
  }
  return ips;
}

/** DoH A-запрос */
async function dohA(domain, provider) {
  const b64 = buildDnsWireQuery(domain);
  for (const ip of provider.ips) {
    try {
      const ips = await new Promise((resolve, reject) => {
        const url = `https://${provider.host}/dns-query?dns=${b64}`;
        const opts = new URL(url);
        const req = https.request({
          hostname: provider.host,
          path: opts.pathname + opts.search,
          port: 443,
          method: 'GET',
          headers: {
            accept: 'application/dns-message',
            host: provider.host,
          },
          lookup: (_hostname, _opts, cb) => cb(null, ip, 4),
          timeout: 6000,
          ...(provider.h2 ? {} : {}),
        }, (res) => {
          const chunks = [];
          res.on('data', c => chunks.push(c));
          res.on('end', () => {
            const buf = Buffer.concat(chunks);
            resolve(parseDnsWireResponse(buf));
          });
        });
        req.on('error', reject);
        req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
        req.end();
      });
      if (ips.length > 0) return ips;
    } catch { /* next ip */ }
  }
  return [];
}

/** Боевая HTTPS-проба — проверить, жив ли IP для данного домена */
function probeIp(domain, ip, timeoutMs = 6000) {
  return new Promise((resolve) => {
    const start = Date.now();
    const req = https.request({
      hostname: domain,
      path: '/',
      port: 443,
      method: 'HEAD',
      lookup: (_h, _o, cb) => cb(null, ip, 4),
      timeout: timeoutMs,
    }, (res) => {
      const code = res.statusCode;
      res.destroy();
      if (code >= 200 && code < 500) resolve({ alive: true, ms: Date.now() - start });
      else resolve({ alive: false });
    });
    req.on('error', () => resolve({ alive: false }));
    req.on('timeout', () => { req.destroy(); resolve({ alive: false }); });
    req.end();
  });
}

// ---------------------------------------------------------------------------
// DNS-пин
// ---------------------------------------------------------------------------

export async function runDnsPin(onProgress) {
  const log = onProgress || (() => {});
  const results = { pinned: [], skipped: [], errors: [] };

  log('Определяю транспорт DNS...');

  // Проверяем доступность sudo
  try {
    execFileSync('sudo', ['-n', 'true'], { timeout: 3000 });
  } catch {
    results.needSudo = true;
    results.errors.push('Нужны права sudo для записи /etc/hosts. Запустите DSH от sudo или выполните патч вручную.');
    return results;
  }

  const pinMap = {}; // domain -> ip[]

  for (const domain of DOMAINS) {
    log(`Проверяю ${domain}...`);
    const ref16s = referenceNet16s(domain);

    // Собираем подменённые IP — из UDP и DoH
    const candidateSet = new Set();

    for (const srv of UDP_PROVIDERS) {
      const ips = digA(domain, srv);
      for (const ip of ips) {
        const pref = ip.split('.').slice(0, 2).join('.');
        if (!ref16s.has(pref)) candidateSet.add(ip);
      }
    }

    for (const prov of DOH_PROVIDERS) {
      try {
        const ips = await dohA(domain, prov);
        for (const ip of ips) {
          const pref = ip.split('.').slice(0, 2).join('.');
          if (!ref16s.has(pref)) candidateSet.add(ip);
        }
      } catch { /* continue */ }
    }

    if (candidateSet.size === 0) {
      log(`  ${domain}: подмены не найдено — пропускаю`);
      results.skipped.push(domain);
      continue;
    }

    // Боевая проба — берём 2 быстрейших
    const probes = [];
    for (const ip of candidateSet) {
      const p = await probeIp(domain, ip);
      if (p.alive) probes.push({ ip, ms: p.ms });
      else log(`  ${ip}: проба не прошла`);
    }

    if (probes.length === 0) {
      log(`  ${domain}: все кандидаты мертвы — пропускаю`);
      results.skipped.push(domain);
      continue;
    }

    probes.sort((a, b) => a.ms - b.ms);
    const top = probes.slice(0, 2).map(p => p.ip);
    pinMap[domain] = top;
    log(`  ${domain} → ${top.join(', ')}`);
    results.pinned.push({ domain, ips: top });
  }

  if (results.pinned.length === 0) {
    results.errors.push('Ни один домен не пропинован — провайдеры не делают подмену для вашего региона/IP.');
    return results;
  }

  // Пишем /etc/hosts
  try {
    let hosts = existsSync(HOSTS_PATH) ? readFileSync(HOSTS_PATH, 'utf8') : '';
    // удалить старый блок
    hosts = hosts.replace(
      new RegExp(`${MARKER_BEGIN}[\\s\\S]*?${MARKER_END}\n?`, 'g'), ''
    );
    const lines = [MARKER_BEGIN];
    for (const { domain, ips } of results.pinned) {
      for (const ip of ips) lines.push(`${ip} ${domain}`);
    }
    lines.push(MARKER_END);
    hosts = hosts.trimEnd() + '\n' + lines.join('\n') + '\n';

    // Пишем через sudo tee
    const proc = spawnSync('sudo', ['tee', HOSTS_PATH], {
      input: hosts, encoding: 'utf8', timeout: 10000,
    });
    if (proc.status !== 0) throw new Error(`sudo tee: ${proc.stderr}`);

    // Сбросить DNS-кэш macOS
    try { execFileSync('sudo', ['dscacheutil', '-flushcache'], { timeout: 5000 }); } catch {}
    try { execFileSync('sudo', ['killall', '-HUP', 'mDNSResponder'], { timeout: 5000 }); } catch {}

    log('DNS-пин записан в /etc/hosts, кэш DNS сброшен.');
  } catch (err) {
    results.errors.push(`Ошибка записи /etc/hosts: ${err.message}`);
  }

  // VPN-маршруты
  try {
    ensurePinRoutes(results.pinned);
  } catch { /* не критично */ }

  return results;
}

/** Добавить host-маршруты мимо VPN для запиненных IP */
function ensurePinRoutes(pinned) {
  // Проверяем, активен ли VPN (default route через utun*)
  try {
    const r = spawnSync('route', ['-n', 'get', '-inet', 'default'], { encoding: 'utf8', timeout: 3000 });
    if (!r.stdout.includes('utun')) return; // VPN не активен
  } catch { return; }

  // Находим физический шлюз
  let gw = '';
  try {
    const r = spawnSync('netstat', ['-rn', '-f', 'inet'], { encoding: 'utf8', timeout: 3000 });
    for (const line of (r.stdout || '').split('\n')) {
      const parts = line.trim().split(/\s+/);
      if (parts[0] === 'default' && !/^(utun|ipsec|ppp|tun|tap)/.test(parts[parts.length - 1])) {
        gw = parts[1]; break;
      }
    }
  } catch {}
  if (!gw) return;

  for (const { ips } of pinned) {
    for (const ip of ips) {
      try { execFileSync('sudo', ['route', '-n', 'delete', '-host', ip], { timeout: 3000 }); } catch {}
      try { execFileSync('sudo', ['route', '-n', 'add', '-host', ip, gw], { timeout: 3000 }); } catch {}
    }
  }
}

export function removeDnsPin() {
  try {
    let hosts = existsSync(HOSTS_PATH) ? readFileSync(HOSTS_PATH, 'utf8') : '';
    if (!hosts.includes(MARKER_BEGIN)) return { ok: true, message: 'Пин не был установлен' };
    hosts = hosts.replace(new RegExp(`${MARKER_BEGIN}[\\s\\S]*?${MARKER_END}\n?`, 'g'), '');
    const proc = spawnSync('sudo', ['tee', HOSTS_PATH], { input: hosts, encoding: 'utf8', timeout: 10000 });
    if (proc.status !== 0) throw new Error(proc.stderr);
    try { execFileSync('sudo', ['dscacheutil', '-flushcache'], { timeout: 5000 }); } catch {}
    try { execFileSync('sudo', ['killall', '-HUP', 'mDNSResponder'], { timeout: 5000 }); } catch {}
    return { ok: true, message: 'DNS-пин удалён из /etc/hosts' };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

export function getDnsPinStatus() {
  try {
    if (!existsSync(HOSTS_PATH)) return { pinned: false, entries: [] };
    const hosts = readFileSync(HOSTS_PATH, 'utf8');
    if (!hosts.includes(MARKER_BEGIN)) return { pinned: false, entries: [] };
    const entries = [];
    let inside = false;
    for (const line of hosts.split('\n')) {
      if (line.trim() === MARKER_BEGIN) { inside = true; continue; }
      if (line.trim() === MARKER_END) { inside = false; continue; }
      if (inside && line.trim()) {
        const [ip, domain] = line.trim().split(/\s+/);
        if (ip && domain) entries.push({ ip, domain });
      }
    }
    return { pinned: true, entries };
  } catch { return { pinned: false, entries: [] }; }
}

// ---------------------------------------------------------------------------
// Бинарный патч: ineligible → inexigible
// ---------------------------------------------------------------------------

function findAgyBin() {
  for (const p of AGY_CANDIDATES) {
    if (existsSync(p)) return p;
  }
  try {
    const r = spawnSync('which', ['agy'], { encoding: 'utf8', timeout: 3000 });
    const p = (r.stdout || '').trim();
    if (p && existsSync(p)) return p;
  } catch {}
  return null;
}

function collectBinaryTargets(appPath) {
  const targets = [];
  const candidates = [
    join(appPath, 'Contents/Resources/bin/language_server'),
  ];
  // language_server с суффиксом версии
  try {
    const dir = join(appPath, 'Contents/Resources/bin');
    if (existsSync(dir)) {
      for (const f of readdirSync(dir)) {
        if (f.startsWith('language_server')) candidates.push(join(dir, f));
      }
    }
  } catch {}
  for (const p of candidates) {
    if (!existsSync(p)) continue;
    try {
      const r = spawnSync('file', [p], { encoding: 'utf8', timeout: 3000 });
      if (!r.stdout.includes('Mach-O')) continue;
    } catch { continue; }
    try {
      const buf = readFileSync(p);
      if (buf.includes('ineligible') || buf.includes('inexigible')) targets.push(p);
    } catch {}
  }
  return targets;
}

function patchBinary(filePath) {
  try {
    const buf = readFileSync(filePath);
    const ineligibleCount = (buf.toString('latin1').match(/ineligible/g) || []).length;
    const inexigibleCount = (buf.toString('latin1').match(/inexigible/g) || []).length;

    if (ineligibleCount === 0 && inexigibleCount > 0) return { status: 'already', count: inexigibleCount };
    if (ineligibleCount === 0) return { status: 'not_found' };

    const patched = Buffer.from(buf.toString('latin1').replace(/ineligible/g, 'inexigible'), 'latin1');

    // Пишем через temp + sudo mv (atomic)
    const tmp = `/tmp/.ag_patch_${Date.now()}.bin`;
    writeFileSync(tmp, patched);
    // Восстановить права
    try {
      const statR = spawnSync('stat', ['-f', '%Mp%Lp', filePath], { encoding: 'utf8', timeout: 3000 });
      const mode = (statR.stdout || '').trim();
      if (mode) spawnSync('chmod', [mode, tmp], { timeout: 3000 });
    } catch {}
    const mv = spawnSync('sudo', ['mv', '-f', tmp, filePath], { timeout: 10000 });
    if (mv.status !== 0) throw new Error(`sudo mv: ${mv.stderr}`);
    // ad-hoc re-sign
    try { spawnSync('sudo', ['codesign', '--force', '--sign', '-', filePath], { timeout: 15000 }); } catch {}
    return { status: 'patched', count: ineligibleCount };
  } catch (err) {
    return { status: 'error', error: err.message };
  }
}

export async function runBinaryPatch(onProgress) {
  const log = onProgress || (() => {});
  const results = { patched: [], alreadyPatched: [], notFound: [], errors: [] };

  // Проверяем sudo
  try { execFileSync('sudo', ['-n', 'true'], { timeout: 3000 }); }
  catch { results.needSudo = true; results.errors.push('Нужны права sudo для патча бинарей.'); return results; }

  const targets = [];

  // Ищем agy CLI
  const agy = findAgyBin();
  if (agy) targets.push(agy);

  // Ищем language_server в .app бандлах
  for (const appPath of APP_CANDIDATES) {
    if (!existsSync(appPath)) continue;
    const binTargets = collectBinaryTargets(appPath);
    targets.push(...binTargets);
    // JS-патч IDE (если это IDE)
    const mainJs = join(appPath, 'Contents/Resources/app/out/main.js');
    if (existsSync(mainJs)) targets.push('__ide_js__:' + appPath);
  }

  if (targets.length === 0) {
    log('Antigravity не найден — бинарный патч пропускается (это нормально, если Antigravity не установлен)');
    results.notFound.push('Antigravity/agy не найдены');
    return results;
  }

  for (const t of targets) {
    if (t.startsWith('__ide_js__:')) {
      // IDE JS-патч — пропускаем (требует Perl-хелпера из оригинального скрипта)
      log(`  IDE JS-патч (${t.slice(11)}): не реализован в плагине — используйте ag_unlocker_mac.sh`);
      continue;
    }
    log(`  Патч: ${t}`);
    const r = patchBinary(t);
    switch (r.status) {
      case 'patched':
        log(`  ✅ Пропатчен (${r.count} вхождений): ${t}`);
        results.patched.push(t);
        // Переподписать бандл
        for (const app of APP_CANDIDATES) {
          if (t.startsWith(app)) {
            try {
              spawnSync('sudo', ['xattr', '-dr', 'com.apple.quarantine', app], { timeout: 5000 });
              spawnSync('sudo', ['codesign', '--force', '--deep', '--sign', '-', app], { timeout: 30000 });
              log(`  ✅ Бандл переподписан: ${app}`);
            } catch {}
          }
        }
        break;
      case 'already':
        log(`  ✅ Уже пропатчен: ${t}`);
        results.alreadyPatched.push(t);
        break;
      case 'not_found':
        log(`  ⚠️ Строка не найдена (новая сборка?): ${t}`);
        results.notFound.push(t);
        break;
      case 'error':
        log(`  ❌ Ошибка: ${r.error}`);
        results.errors.push(`${t}: ${r.error}`);
        break;
    }
  }

  return results;
}

export async function revertBinaryPatch(onProgress) {
  const log = onProgress || (() => {});
  const targets = [];
  const agy = findAgyBin();
  if (agy) targets.push(agy);
  for (const appPath of APP_CANDIDATES) {
    if (!existsSync(appPath)) continue;
    const binTargets = collectBinaryTargets(appPath);
    targets.push(...binTargets);
  }
  const results = { reverted: [], errors: [] };
  for (const t of targets) {
    try {
      const buf = readFileSync(t);
      const inexigibleCount = (buf.toString('latin1').match(/inexigible/g) || []).length;
      if (inexigibleCount === 0) continue;
      const restored = Buffer.from(buf.toString('latin1').replace(/inexigible/g, 'ineligible'), 'latin1');
      const tmp = `/tmp/.ag_restore_${Date.now()}.bin`;
      writeFileSync(tmp, restored);
      const mv = spawnSync('sudo', ['mv', '-f', tmp, t], { timeout: 10000 });
      if (mv.status !== 0) throw new Error(`sudo mv: ${mv.stderr}`);
      try { spawnSync('sudo', ['codesign', '--force', '--sign', '-', t], { timeout: 15000 }); } catch {}
      log(`  ✅ Откачен: ${t}`);
      results.reverted.push(t);
    } catch (err) {
      results.errors.push(`${t}: ${err.message}`);
    }
  }
  return results;
}

// ---------------------------------------------------------------------------
// Статус патча бинарей
// ---------------------------------------------------------------------------

export function getBinaryPatchStatus() {
  const status = [];
  const agy = findAgyBin();
  if (agy) {
    try {
      const buf = readFileSync(agy);
      const s = buf.toString('latin1');
      status.push({ file: agy, patched: s.includes('inexigible'), hasString: s.includes('ineligible') || s.includes('inexigible') });
    } catch { status.push({ file: agy, error: true }); }
  }
  for (const appPath of APP_CANDIDATES) {
    if (!existsSync(appPath)) continue;
    const ls = join(appPath, 'Contents/Resources/bin/language_server');
    if (!existsSync(ls)) continue;
    try {
      const buf = readFileSync(ls);
      const s = buf.toString('latin1');
      status.push({ file: ls, patched: s.includes('inexigible'), hasString: s.includes('ineligible') || s.includes('inexigible') });
    } catch { status.push({ file: ls, error: true }); }
  }
  return status;
}

// ---------------------------------------------------------------------------
// Watchdog (LaunchAgent)
// ---------------------------------------------------------------------------

const WATCH_LABEL = 'com.asalio123.agunlocker.watch';
const WATCH_PLIST = join(homedir(), `Library/LaunchAgents/${WATCH_LABEL}.plist`);
const UNLOCKER_SCRIPT = join(homedir(), 'ag_unlocker_mac.sh');

export function installWatchdog() {
  if (!existsSync(UNLOCKER_SCRIPT)) {
    return { ok: false, error: `Скрипт не найден: ${UNLOCKER_SCRIPT}. Скачайте ag_unlocker_mac.sh в домашнюю папку.` };
  }
  try {
    const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>${WATCH_LABEL}</string>
  <key>ProgramArguments</key>
  <array><string>/bin/bash</string><string>${UNLOCKER_SCRIPT}</string><string>--watch</string></array>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardOutPath</key><string>/tmp/ag_unlocker_watch.log</string>
  <key>StandardErrorPath</key><string>/tmp/ag_unlocker_watch.log</string>
</dict></plist>`;
    writeFileSync(WATCH_PLIST, plist, { mode: 0o644 });
    try { execFileSync('launchctl', ['bootout', `gui/${process.getuid?.() ?? 501}/${WATCH_LABEL}`], { timeout: 5000 }); } catch {}
    execFileSync('launchctl', ['bootstrap', `gui/${process.getuid?.() ?? 501}`, WATCH_PLIST], { timeout: 10000 });
    return { ok: true, message: 'Watchdog установлен (авто-репатч после обновлений Antigravity).' };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

export function uninstallWatchdog() {
  try {
    try { execFileSync('launchctl', ['bootout', `gui/${process.getuid?.() ?? 501}/${WATCH_LABEL}`], { timeout: 5000 }); } catch {}
    if (existsSync(WATCH_PLIST)) {
      unlinkSync(WATCH_PLIST);
    }
    return { ok: true, message: 'Watchdog остановлен.' };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

export function getWatchdogStatus() {
  return { installed: existsSync(WATCH_PLIST) };
}
