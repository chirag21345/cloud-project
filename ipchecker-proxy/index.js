import fs from 'fs';
import path from 'path';
import express from 'express';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 8090;
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || '';
if (!ADMIN_TOKEN) {
  console.warn('[proxy] ADMIN_TOKEN not set — /admin/* and POST /routes will return 503');
}
app.use(express.json());
app.use((req, res, next) => {
  res.set('Access-Control-Allow-Origin', '*');
  next();
});

function requireAdmin(req, res, next) {
  if (!ADMIN_TOKEN) {
    return res.status(503).json({ error: true, message: 'admin disabled (ADMIN_TOKEN unset)' });
  }
  const header = req.get('X-Admin-Token') || (req.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  if (header !== ADMIN_TOKEN) {
    return res.status(401).json({ error: true, message: 'unauthorized' });
  }
  next();
}

function isSafeProbeTarget(rawUrl) {
  let u;
  try {
    u = new URL(rawUrl);
  } catch {
    return false;
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return false;
  const host = u.hostname.toLowerCase();
  if (host === 'localhost' || host === '0.0.0.0' || host === '::1') return false;
  if (/^127\./.test(host)) return false;
  if (/^10\./.test(host)) return false;
  if (/^192\.168\./.test(host)) return false;
  if (/^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(host)) return false;
  if (/^169\.254\./.test(host)) return false;
  if (host.endsWith('.internal') || host === 'host.docker.internal') return false;
  return true;
}

let routesConfig = {};
const rrState = {};

function loadConfig() {
  const cfgPath = path.join(__dirname, 'config.json');
  try {
    const raw = fs.readFileSync(cfgPath, 'utf-8');
    routesConfig = JSON.parse(raw);
  } catch (e) {
    console.error('Failed to load config.json', e);
  }
  if (process.env.ROUTES_JSON) {
    try {
      const overrides = JSON.parse(process.env.ROUTES_JSON);
      routesConfig = { ...routesConfig, ...overrides };
      console.log('[proxy] applied ROUTES_JSON override');
    } catch (e) {
      console.error('[proxy] ROUTES_JSON parse failed', e);
    }
  }
  Object.keys(routesConfig).forEach((k) => {
    if (!rrState[k]) rrState[k] = 0;
  });
  console.log('Proxy config loaded');
}

function saveConfig() {
  const cfgPath = path.join(__dirname, 'config.json');
  try {
    fs.writeFileSync(cfgPath, JSON.stringify(routesConfig, null, 2));
  } catch (e) {
    console.error('Failed to write config.json', e);
  }
}

loadConfig();
fs.watch(path.join(__dirname, 'config.json'), { persistent: false }, () => {
  setTimeout(loadConfig, 200);
});

app.get('/routes', (req, res) => {
  res.json({ error: false, routes: routesConfig });
});

app.post('/routes', requireAdmin, (req, res) => {
  if (typeof req.body !== 'object') {
    return res.status(400).json({ error: true, message: 'invalid payload' });
  }
  routesConfig = req.body;
  Object.keys(routesConfig).forEach((k) => {
    if (!rrState[k]) rrState[k] = 0;
  });
  saveConfig();
  res.json({ error: false, routes: routesConfig });
});

app.use('/admin', requireAdmin);

app.get('/admin/reload', (req, res) => {
  loadConfig();
  res.json({ error: false, routes: routesConfig });
});

app.get('/admin/add', (req, res) => {
  const svc = req.query.service;
  const target = req.query.target;
  if (!svc || !target) {
    return res.status(400).json({ error: true, message: 'service and target required' });
  }
  if (!routesConfig[svc]) routesConfig[svc] = [];
  if (!routesConfig[svc].includes(target)) {
    routesConfig[svc].push(target);
  }
  rrState[svc] = rrState[svc] || 0;
  saveConfig();
  res.json({ error: false, routes: routesConfig[svc] });
});

app.get('/admin/probe', async (req, res) => {
  const svc = req.query.service;
  const target = req.query.target;
  if (!svc || !target) {
    return res.status(400).json({ error: true, message: 'service and target required' });
  }
  if (!isSafeProbeTarget(target)) {
    return res.status(400).json({ error: true, message: 'target rejected (private/loopback/non-http(s) blocked)' });
  }
  try {
    const r = await fetch(target, { method: 'GET', redirect: 'manual' });
    if (!r.ok) {
      return res.status(502).json({ error: true, message: 'probe failed', status: r.status });
    }
    if (!routesConfig[svc]) routesConfig[svc] = [];
    if (!routesConfig[svc].includes(target)) {
      routesConfig[svc].push(target);
    }
    rrState[svc] = rrState[svc] || 0;
    saveConfig();
    return res.json({ error: false, routes: routesConfig[svc] });
  } catch (e) {
    return res.status(502).json({ error: true, message: 'probe error' });
  }
});

app.get('/admin/remove', (req, res) => {
  const svc = req.query.service;
  const target = req.query.target;
  if (!svc) {
    return res.status(400).json({ error: true, message: 'service required' });
  }
  if (!routesConfig[svc]) {
    return res.status(404).json({ error: true, message: 'service not found' });
  }
  if (target) {
    routesConfig[svc] = routesConfig[svc].filter((t) => t !== target);
  } else {
    delete routesConfig[svc];
  }
  saveConfig();
  res.json({ error: false, routes: routesConfig });
});

async function proxyToTargets(service, req, res) {
  const targets = routesConfig[service];
  if (!Array.isArray(targets) || targets.length === 0) {
    return res.status(404).json({ error: true, message: 'service not configured' });
  }
  const startIdx = rrState[service] % targets.length;
  for (let i = 0; i < targets.length; i++) {
    const idx = (startIdx + i) % targets.length;
    const target = targets[idx];
    const url = target + (req.originalUrl.includes('?') ? req.originalUrl.split('?')[1] ? '?' + req.originalUrl.split('?')[1] : '' : '');
    try {
      const upstream = await fetch(url);
      const bodyText = await upstream.text();
      res.status(upstream.status);
      res.set('Content-Type', upstream.headers.get('content-type') || 'application/json');
      res.send(bodyText);
      rrState[service] = idx + 1;
      return;
    } catch (e) {
      continue;
    }
  }
  res.status(502).json({ error: true, message: 'all targets failed' });
}

app.get('/:service', (req, res) => {
  proxyToTargets(req.params.service, req, res);
});

app.listen(PORT, () => {
  console.log(`ipchecker-proxy listening on ${PORT}`);
});
