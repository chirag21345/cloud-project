import express from 'express';
import fs from 'fs';
import path from 'path';
import { randomBytes } from 'crypto';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, 'data');
const dataFile = path.join(dataDir, 'store.json');
const app = express();
const PORT = process.env.PORT || 8087;

app.use((req, res, next) => {
  res.set('Access-Control-Allow-Origin', '*');
  next();
});

let store = {};
try {
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
  if (fs.existsSync(dataFile)) {
    store = JSON.parse(fs.readFileSync(dataFile, 'utf-8'));
  }
} catch (e) {
  store = {};
}

function saveData() {
  try {
    fs.writeFileSync(dataFile, JSON.stringify(store, null, 2));
  } catch (e) {
    // ignore
  }
}

app.get('/', (req, res) => {
  const op = req.query.op;
  if (!op) return res.status(400).json({ error: true, message: 'op is required' });

  if (op === 'save') {
    const items = (req.query.items || '').trim();
    if (!items) return res.status(400).json({ error: true, message: 'items parameter is required' });
    const id = randomBytes(4).toString('hex');
    store[id] = items;
    saveData();
    return res.json({ error: false, id, items });
  }

  if (op === 'load') {
    const id = (req.query.id || '').trim();
    if (!id) return res.status(400).json({ error: true, message: 'id parameter is required' });
    if (!store[id]) return res.status(404).json({ error: true, message: 'id not found' });
    return res.json({ error: false, id, items: store[id] });
  }

  return res.status(400).json({ error: true, message: 'unknown op' });
});

app.listen(PORT, () => {
  console.log(`ipchecker-store listening on ${PORT}`);
});
