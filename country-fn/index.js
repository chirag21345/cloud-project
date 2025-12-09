const mapCountry = (ip) => {
  const code = ip.slice(0, 3);
  if (code === '100') return 'US';
  if (code === '101') return 'UK';
  if (code === '102') return 'China';
  return 'Unknown';
};

exports.handler = async (event) => {
  const itemsRaw = event?.queryStringParameters?.items || '';
  if (itemsRaw.trim() === '') {
    return {
      statusCode: 400,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ error: true, message: 'items parameter is required' }),
    };
  }

  const ips = itemsRaw.split(',').map((i) => i.trim()).filter((i) => i !== '');
  const results = ips.map((ip) => {
    let country = 'Unknown';
    if (ip.includes('.') && ip.split('.').length === 4) {
      country = mapCountry(ip);
    }
    return { ip, country };
  });

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    body: JSON.stringify({ error: false, items: itemsRaw, results }),
  };
};

// simple runner for local HTTP testing
if (require.main === module) {
  const express = require('express');
  const app = express();
  const PORT = process.env.PORT || 80;

  app.get('/', async (req, res) => {
    const response = await exports.handler({ queryStringParameters: { items: req.query.items || '' } });
    res.status(response.statusCode).set(response.headers).send(response.body);
  });

  app.listen(PORT, () => {
    console.log(`country-fn listening on ${PORT}`);
  });
}
