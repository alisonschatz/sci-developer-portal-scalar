import { test } from 'node:test';
import assert from 'node:assert/strict';
import { operationKeyFromPointer } from '../src/plugins/business-plugin.js';

test('extrai "MÉTODO /caminho" de um pointer simples', () => {
  const key = operationKeyFromPointer('#/paths/~1api~1v1~1auth~1credencial~1login/post');
  assert.equal(key, 'POST /api/v1/auth/credencial/login');
});

test('lida com parâmetros de path ({tipo_documento}) sem escapar errado', () => {
  const key = operationKeyFromPointer('#/paths/~1api~1v1~1documento~1funcionario~1{tipo_documento}/get');
  assert.equal(key, 'GET /api/v1/documento/funcionario/{tipo_documento}');
});

test('normaliza o método para maiúsculas', () => {
  const key = operationKeyFromPointer('#/paths/~1api~1v1~1feriados/get');
  assert.equal(key, 'GET /api/v1/feriados');
});

test('retorna null para pointers que não são de uma Operation', () => {
  assert.equal(operationKeyFromPointer('#/components/schemas/Funcionario'), null);
  assert.equal(operationKeyFromPointer(''), null);
  assert.equal(operationKeyFromPointer(undefined), null);
});

test('decodifica ~0 (til) além de ~1 (barra) — caso raro mas previsto no JSON Pointer', () => {
  const key = operationKeyFromPointer('#/paths/~1api~1v1~1a~0b/get');
  assert.equal(key, 'GET /api/v1/a~b');
});
