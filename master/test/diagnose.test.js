const test = require('node:test'); const assert = require('node:assert');
const { diagnose } = require('../src/diagnose');
test('diagnostic automatique des signalements', () => {
  assert.strictEqual(diagnose({ message: 'password authentication failed for user x' }).category, 'Base de données');
  assert.strictEqual(diagnose({ message: 'Failed to fetch' }).category, 'Réseau');
  assert.strictEqual(diagnose({ message: "Cannot read properties of undefined (reading 'trucks')" }).category, 'Bug application');
  assert.strictEqual(diagnose({ message: 'écran blanc bizarre' }).category, 'À analyser');
  assert.strictEqual(diagnose({}).category, 'Inconnu');
});

test('nature du signalement : mot de passe, panne de téléphone, erreur serveur', () => {
  const { signalType } = require('../src/diagnose');
  assert.equal(signalType({ message: "J'ai oublié mon mot de passe" }), 'Mot de passe');
  assert.equal(signalType({ message: 'Impossible de me connecter, identifiant refusé' }), 'Mot de passe');
  assert.equal(signalType({ message: 'Mon téléphone est tombé dans l\'eau, écran cassé' }), 'Panne de téléphone');
  assert.equal(signalType({ message: 'Le tactile ne répond plus' }), 'Panne de téléphone');
  assert.equal(signalType({ role: 'SYSTEM', message: 'ECONNREFUSED' }), 'Erreur serveur');
  assert.equal(signalType({ message: 'Le total est faux' }), 'Autre problème');
});
