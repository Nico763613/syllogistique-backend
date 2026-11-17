const test = require('node:test'); const assert = require('node:assert');
const { notify, channels } = require('../src/notify');
test('aucun canal configuré : rien n\'est envoyé et aucune erreur', async () => {
  assert.deepStrictEqual(channels({}), []);
  const r = await notify('t1', 'x', 'y', {}); assert.strictEqual(r.skipped, 'no-channel');
});
test('canaux détectés selon les variables', () => {
  assert.deepStrictEqual(channels({ BREVO_API_KEY: 'k', MAIL_FROM: 'a@b.c', MASTER_ADMIN_EMAIL: 'z@z.z', NTFY_TOPIC: 'abc' }), ['email', 'ntfy']);
  assert.deepStrictEqual(channels({ BREVO_API_KEY: 'k' }), []);
});
