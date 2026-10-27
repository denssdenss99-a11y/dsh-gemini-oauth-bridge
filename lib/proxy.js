// lib/proxy.js — zero-dependency proxy client supporting HTTP, HTTPS, and SOCKS5.
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import tls from 'node:tls';

function connectSocks5(proxyUrl, targetHost, targetPort) {
  return new Promise((resolve, reject) => {
    const p = new URL(proxyUrl);
    const socket = net.connect({
      host: p.hostname,
      port: Number(p.port) || 1080,
    });

    const cleanup = () => {
      socket.removeListener('error', onError);
    };

    const onError = (err) => {
      cleanup();
      reject(err);
    };
    socket.once('error', onError);

    socket.once('connect', () => {
      const hasAuth = !!p.username;
      const methods = hasAuth ? [0x00, 0x02] : [0x00];
      socket.write(Buffer.from([0x05, methods.length, ...methods]));

      socket.once('data', (greetingResp) => {
        if (greetingResp[0] !== 0x05) {
          socket.destroy();
          cleanup();
          return reject(new Error('SOCKS5 handshake failed: invalid version'));
        }
        const chosenMethod = greetingResp[1];

        const sendConnect = () => {
          const hostBuf = Buffer.from(targetHost, 'utf8');
          const portNum = Number(targetPort) || 443;
          const req = Buffer.concat([
            Buffer.from([0x05, 0x01, 0x00, 0x03, hostBuf.length]),
            hostBuf,
            Buffer.from([portNum >> 8, portNum & 0xff]),
          ]);
          socket.write(req);
          socket.once('data', (connResp) => {
            cleanup();
            if (connResp[0] !== 0x05 || connResp[1] !== 0x00) {
              socket.destroy();
              return reject(new Error(`SOCKS5 CONNECT failed with code 0x${connResp[1].toString(16)}`));
            }
            resolve(socket);
          });
        };

        if (chosenMethod === 0x02 && hasAuth) {
          const uBuf = Buffer.from(decodeURIComponent(p.username || ''), 'utf8');
          const pBuf = Buffer.from(decodeURIComponent(p.password || ''), 'utf8');
          const authBuf = Buffer.concat([
            Buffer.from([0x01, uBuf.length]),
            uBuf,
            Buffer.from([pBuf.length]),
            pBuf,
          ]);
          socket.write(authBuf);
          socket.once('data', (authResp) => {
            if (authResp[1] !== 0x00) {
              socket.destroy();
              cleanup();
              return reject(new Error('SOCKS5 authentication failed'));
            }
            sendConnect();
          });
        } else if (chosenMethod === 0x00) {
          sendConnect();
        } else {
          socket.destroy();
          cleanup();
          return reject(new Error(`SOCKS5 proxy rejected authentication method 0x${chosenMethod.toString(16)}`));
        }
      });
    });
  });
}

export function makeProxyAgent(proxyUrl) {
  if (!proxyUrl || typeof proxyUrl !== 'string') return null;
  const trimmed = proxyUrl.trim();
  if (!trimmed) return null;

  let parsed;
  try {
    parsed = new URL(trimmed);
  } catch {
    return null;
  }

  const isSocks = parsed.protocol.startsWith('socks');
  const isHttpsProxy = parsed.protocol === 'https:';

  return new https.Agent({
    keepAlive: true,
    createConnection(opts, callback) {
      const targetHost = opts.host || opts.hostname;
      const targetPort = opts.port || 443;

      if (isSocks) {
        connectSocks5(trimmed, targetHost, targetPort)
          .then((rawSocket) => {
            const tlsSocket = tls.connect({
              host: targetHost,
              servername: opts.servername || targetHost,
              socket: rawSocket,
            }, () => callback(null, tlsSocket));
            tlsSocket.on('error', callback);
          })
          .catch(callback);
        return;
      }

      const transport = isHttpsProxy ? https : http;
      const proxyReq = transport.request({
        host: parsed.hostname,
        port: Number(parsed.port) || (isHttpsProxy ? 443 : 80),
        method: 'CONNECT',
        path: `${targetHost}:${targetPort}`,
        headers: {
          Host: `${targetHost}:${targetPort}`,
          ...(parsed.username
            ? {
                'Proxy-Authorization':
                  'Basic ' +
                  Buffer.from(
                    `${decodeURIComponent(parsed.username)}:${decodeURIComponent(parsed.password || '')}`,
                  ).toString('base64'),
              }
            : {}),
        },
      });

      proxyReq.on('connect', (res, socket) => {
        if (res.statusCode === 200) {
          const tlsSocket = tls.connect({
            host: targetHost,
            servername: opts.servername || targetHost,
            socket,
          }, () => callback(null, tlsSocket));
          tlsSocket.on('error', callback);
        } else {
          callback(new Error(`Proxy CONNECT rejected: ${res.statusCode} ${res.statusMessage || ''}`));
        }
      });

      proxyReq.on('error', callback);
      proxyReq.end();
    },
  });
}

export function resolveProxyUrl(customProxy) {
  if (customProxy && typeof customProxy === 'string' && customProxy.trim()) {
    return customProxy.trim();
  }
  const env = process.env.HTTPS_PROXY || process.env.https_proxy || process.env.ALL_PROXY || process.env.all_proxy || process.env.HTTP_PROXY || process.env.http_proxy;
  if (env && typeof env === 'string' && env.trim()) {
    return env.trim();
  }
  return null;
}

export async function universalFetch(urlStr, options = {}, customProxy = null) {
  const proxyUrl = resolveProxyUrl(customProxy);

  if (!proxyUrl) {
    return globalThis.fetch(urlStr, options);
  }

  const agent = makeProxyAgent(proxyUrl);
  if (!agent) {
    return globalThis.fetch(urlStr, options);
  }

  const parsedUrl = new URL(urlStr);
  const isHttps = parsedUrl.protocol === 'https:';
  const transport = isHttps ? https : http;
  const method = options.method || 'GET';
  const headers = { ...(options.headers || {}) };
  const signal = options.signal;

  return new Promise((resolve, reject) => {
    let finished = false;
    const req = transport.request(parsedUrl, {
      method,
      headers,
      agent: isHttps ? agent : undefined,
    }, (res) => {
      finished = true;
      const response = {
        ok: res.statusCode >= 200 && res.statusCode < 300,
        status: res.statusCode,
        statusText: res.statusMessage || '',
        headers: {
          get(name) {
            const val = res.headers[name.toLowerCase()];
            return Array.isArray(val) ? val.join(', ') : (val ?? null);
          },
        },
        body: res,
        async text() {
          const chunks = [];
          for await (const chunk of res) chunks.push(chunk);
          return Buffer.concat(chunks).toString('utf8');
        },
        async json() {
          const t = await this.text();
          return JSON.parse(t);
        },
        async arrayBuffer() {
          const chunks = [];
          for await (const chunk of res) chunks.push(chunk);
          const buf = Buffer.concat(chunks);
          return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
        },
      };
      resolve(response);
    });

    if (signal) {
      if (signal.aborted) {
        req.destroy(new Error('Aborted'));
        return reject(new Error('Aborted'));
      }
      signal.addEventListener('abort', () => {
        if (!finished) {
          req.destroy(new Error('Aborted'));
          reject(new Error('Aborted'));
        }
      });
    }

    req.on('error', (err) => {
      if (!finished) reject(err);
    });

    if (options.body) {
      if (typeof options.body === 'string' || Buffer.isBuffer(options.body)) {
        req.write(options.body);
      } else if (typeof options.body.pipe === 'function') {
        options.body.pipe(req);
        return;
      }
    }
    req.end();
  });
}

export async function testProxy(proxyUrl) {
  if (!proxyUrl) return { ok: false, error: 'Прокси не задан' };
  const start = Date.now();
  try {
    const res = await universalFetch('https://accounts.google.com/o/oauth2/v2/auth', {
      method: 'HEAD',
      signal: AbortSignal.timeout(8000),
    }, proxyUrl);
    const latencyMs = Date.now() - start;
    return { ok: res.status < 500, status: res.status, latencyMs };
  } catch (err) {
    return { ok: false, error: String(err?.message ?? err) };
  }
}
