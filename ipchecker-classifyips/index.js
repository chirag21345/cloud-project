const express = require('express');
const app = express();
const PORT = process.env.PORT || 80;

const isIPv4 = (ip) => {
  const parts = ip.split('.');
  // IPv4: exactly 4 non-empty groups
  return parts.length === 4 && parts.every((p) => p !== '');
};

const isIPv6 = (ip) => {
  const parts = ip.split(':');
  return parts.length >= 2 && parts.length <= 8;
};

app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  next();
});

app.get('/', (req, res) => {
  const itemsRaw = (req.query.items || '').trim();

  if (itemsRaw === '') {
    return res.status(400).json({
      error: true,
      message: 'items parameter is required',
      items: ''
    });
  }

  const ips = itemsRaw
    .split(',')
    .map((i) => i.trim())
    .filter((i) => i !== '');

  const ipv4 = [];
  const ipv6 = [];

  ips.forEach((ip) => {
    if (isIPv4(ip)) {
      ipv4.push(ip);
    } else if (isIPv6(ip)) {
      ipv6.push(ip);
    }
  });

  return res.json({
    error: false,
    items: itemsRaw,
    ipv4,
    ipv6,
  });
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`ipchecker-classifyips listening on ${PORT}`);
  });
}

module.exports = app;
