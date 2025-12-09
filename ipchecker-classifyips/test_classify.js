const assert = require('assert');
const app = require('./index');

const server = app.listen(3084, async () => {
  try {
    const res = await fetch(
      'http://localhost:3084/?items=1.1.1.1,2a00:1450:400e:811::200e,foo'
    );
    assert.strictEqual(res.status, 200);

    const body = await res.json();

    assert.strictEqual(body.error, false);
    assert.strictEqual(body.items, '1.1.1.1,2a00:1450:400e:811::200e,foo');
    assert.deepStrictEqual(body.ipv4, ['1.1.1.1']);
    assert.deepStrictEqual(body.ipv6, ['2a00:1450:400e:811::200e']);

    // Missing items should return 400
    const bad = await fetch('http://localhost:3084/');
    assert.strictEqual(bad.status, 400);

    console.log('classifyips tests passed');
  } catch (err) {
    console.error(err);
    process.exit(1);
  } finally {
    server.close();
  }
});
