const test = require('node:test'); const assert = require('node:assert');
const { summarize, status } = require('../src/backups');
const H = 3600e3, now = Date.now();
test('sauvegarde à jour / en retard / inconnue', async () => {
  assert.strictEqual(summarize([{ created_at: new Date(now - 5 * H).toISOString(), status: 'completed', conclusion: 'success' }], now).state, 'OK');
  assert.strictEqual(summarize([{ created_at: new Date(now - 2 * H).toISOString(), status: 'completed', conclusion: 'failure' }, { created_at: new Date(now - 200 * H).toISOString(), status: 'completed', conclusion: 'success' }], now).state, 'STALE');
  assert.strictEqual(summarize([], now).state, 'UNKNOWN');
  assert.deepStrictEqual(await status({}), { configured: false });
});
