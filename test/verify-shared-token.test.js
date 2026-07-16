import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scriptSetsVariable } from '../scripts/verify-shared-token.js';

test('detecta pm.globals.set com aspas simples', () => {
  assert.equal(scriptSetsVariable("pm.globals.set('sci_auth_token', data.token);", 'sci_auth_token'), true);
});

test('detecta pm.globals.set com aspas duplas', () => {
  assert.equal(scriptSetsVariable('pm.globals.set("sci_auth_token", data.token);', 'sci_auth_token'), true);
});

test('não confunde com pm.environment.set (escopo por documento, não compartilhado)', () => {
  assert.equal(scriptSetsVariable("pm.environment.set('sci_auth_token', data.token);", 'sci_auth_token'), false);
});

test('não confunde com uma variável de nome parecido', () => {
  assert.equal(scriptSetsVariable("pm.globals.set('sci_auth_token_v2', data.token);", 'sci_auth_token'), false);
});
