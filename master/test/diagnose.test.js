const test = require('node:test'); const assert = require('node:assert');
const { diagnose } = require('../src/diagnose');
test('diagnostic automatique des signalements', () => {
  assert.strictEqual(diagnose({ message: 'password authentication failed for user x' }).category, 'Base de données');
  assert.strictEqual(diagnose({ message: 'Failed to fetch' }).category, 'Réseau');
  assert.strictEqual(diagnose({ message: "Cannot read properties of undefined (reading 'trucks')" }).category, 'Bug application');
  assert.strictEqual(diagnose({ message: 'écran blanc bizarre' }).category, 'À analyser');
  assert.strictEqual(diagnose({}).category, 'Inconnu');
});
