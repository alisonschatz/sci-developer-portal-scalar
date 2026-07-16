import { test } from 'node:test';
import assert from 'node:assert/strict';
import { matchesLoginRequest, extractToken } from '../src/composables/useTokenCapture.js';

const loginRequest = { method: 'POST', path: '/api/v1/auth/credencial/login' };

test('matchesLoginRequest reconhece a URL e método corretos (string input)', () => {
  assert.equal(
    matchesLoginRequest(loginRequest, 'https://api-auth.sci.com.br/api/v1/auth/credencial/login', { method: 'POST' }),
    true
  );
});

test('matchesLoginRequest reconhece um objeto Request-like como input', () => {
  assert.equal(
    matchesLoginRequest(loginRequest, { url: 'https://x/api/v1/auth/credencial/login', method: 'POST' }),
    true
  );
});

test('matchesLoginRequest ignora GET para a mesma URL', () => {
  assert.equal(
    matchesLoginRequest(loginRequest, 'https://x/api/v1/auth/credencial/login', { method: 'GET' }),
    false
  );
});

test('matchesLoginRequest ignora POST para uma URL diferente (ex.: bundle da própria API sendo carregado)', () => {
  assert.equal(matchesLoginRequest(loginRequest, 'https://x/openapi/auth.json', { method: 'POST' }), false);
});

test('matchesLoginRequest lida com input sem URL sem lançar erro', () => {
  assert.equal(matchesLoginRequest(loginRequest, undefined, {}), false);
});

test('extractToken pega o campo certo quando presente', () => {
  assert.equal(extractToken('token', { token: 'abc.def.ghi' }), 'abc.def.ghi');
});

test('extractToken retorna null quando o campo está ausente', () => {
  assert.equal(extractToken('token', { outroCoisa: 'x' }), null);
});

test('extractToken retorna null para valores não-string (defende contra respostas malformadas)', () => {
  assert.equal(extractToken('token', { token: 12345 }), null);
  assert.equal(extractToken('token', { token: null }), null);
  assert.equal(extractToken('token', null), null);
});
