import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateManifest, getAuthProvider, apis, SHARED_TOKEN_VARIABLE } from '../apis.manifest.js';

test('o manifesto real (apis.manifest.js) é válido', () => {
  const errors = validateManifest();
  assert.deepEqual(errors, []);
});

test('getAuthProvider() encontra a API auth no manifesto real', () => {
  const provider = getAuthProvider();
  assert.equal(provider.id, 'auth');
  assert.equal(provider.isAuthProvider, true);
});

test('SHARED_TOKEN_VARIABLE está definida e não é vazia', () => {
  assert.ok(SHARED_TOKEN_VARIABLE && SHARED_TOKEN_VARIABLE.length > 0);
});

test('rejeita manifesto vazio', () => {
  const errors = validateManifest([]);
  assert.ok(errors.some((e) => e.includes('vazio')));
});

test('rejeita id fora de kebab-case', () => {
  const errors = validateManifest([
    { id: 'Auth_API', slug: 'auth', sourceUrlEnv: 'X', serverUrl: 'https://x', isAuthProvider: true, default: true },
  ]);
  assert.ok(errors.some((e) => e.includes('id inválido')));
});

test('rejeita id duplicado', () => {
  const base = { sourceUrlEnv: 'X', serverUrl: 'https://x', securityScheme: 'bearerAuth' };
  const errors = validateManifest([
    { ...base, id: 'auth', slug: 'a', isAuthProvider: true, default: true, securityScheme: null },
    { ...base, id: 'auth', slug: 'b', isAuthProvider: false, default: false },
  ]);
  assert.ok(errors.some((e) => e.includes('id duplicado')));
});

test('rejeita slug duplicado', () => {
  const base = { sourceUrlEnv: 'X', serverUrl: 'https://x', securityScheme: 'bearerAuth' };
  const errors = validateManifest([
    { ...base, id: 'auth', slug: 'mesmo', isAuthProvider: true, default: true, securityScheme: null },
    { ...base, id: 'rh', slug: 'mesmo', isAuthProvider: false, default: false },
  ]);
  assert.ok(errors.some((e) => e.includes('slug duplicado')));
});

test('rejeita zero APIs marcadas como isAuthProvider', () => {
  const errors = validateManifest([
    { id: 'a', slug: 'a', sourceUrlEnv: 'X', serverUrl: 'https://x', isAuthProvider: false, default: true, securityScheme: 'bearerAuth' },
  ]);
  assert.ok(errors.some((e) => e.includes('isAuthProvider: true')));
});

test('rejeita duas APIs marcadas como isAuthProvider', () => {
  const base = { sourceUrlEnv: 'X', serverUrl: 'https://x', securityScheme: null };
  const errors = validateManifest([
    { ...base, id: 'a', slug: 'a', isAuthProvider: true, default: true },
    { ...base, id: 'b', slug: 'b', isAuthProvider: true, default: false },
  ]);
  assert.ok(errors.some((e) => e.includes('exatamente 1 API com isAuthProvider')));
});

test('rejeita zero ou duas APIs marcadas como default', () => {
  const base = { sourceUrlEnv: 'X', serverUrl: 'https://x', isAuthProvider: false, securityScheme: 'bearerAuth' };
  const nenhumaDefault = validateManifest([{ ...base, id: 'a', slug: 'a', default: false, isAuthProvider: true, securityScheme: null }]);
  assert.ok(nenhumaDefault.some((e) => e.includes('exatamente 1 API com default')));

  const duasDefault = validateManifest([
    { ...base, id: 'a', slug: 'a', default: true, isAuthProvider: true, securityScheme: null },
    { ...base, id: 'b', slug: 'b', default: true },
  ]);
  assert.ok(duasDefault.some((e) => e.includes('exatamente 1 API com default')));
});

test('API que não é auth provider e não define securityScheme gera erro (evita "esqueci de plugar o token")', () => {
  const errors = validateManifest([
    { id: 'auth', slug: 'auth', sourceUrlEnv: 'X', serverUrl: 'https://x', isAuthProvider: true, default: true, securityScheme: null },
    { id: 'nova', slug: 'nova', sourceUrlEnv: 'Y', serverUrl: 'https://y', isAuthProvider: false, default: false },
  ]);
  assert.ok(errors.some((e) => e.includes('nova') && e.includes('securityScheme')));
});

test('sanity check: todas as APIs reais do manifesto têm decorators previstos', () => {
  // Não checa o filesystem aqui (isso é papel de outro script), só a forma dos dados.
  for (const api of apis) {
    assert.ok(api.id);
    assert.ok(api.title);
    assert.ok(api.slug);
  }
});
