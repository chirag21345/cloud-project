const assert = require('assert');
const { handler } = require('./index');

(async () => {
  const event = { queryStringParameters: { items: '100.1.1.1,8.8.8.8,102.10.10.10' } };
  const res = await handler(event);
  assert.strictEqual(res.statusCode, 200);
  const body = JSON.parse(res.body);
  const countries = body.results.map(r => r.country);
  assert.deepStrictEqual(countries, ['US', 'Unknown', 'China']);

  const bad = await handler({ queryStringParameters: { items: '' } });
  assert.strictEqual(bad.statusCode, 400);
  console.log('country-fn tests passed');
})().catch(err => {
  console.error(err);
  process.exit(1);
});
