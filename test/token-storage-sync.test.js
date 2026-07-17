import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  authStorageKey,
  readAuthEntry,
  writeTokenToScheme,
  getTokenStorageTargets,
  syncTokenToStorage,
  getMultiSchemeDocuments,
  ensureDocumentSelectedSchemes,
  ensureAllMultiSchemeSelections,
  mergeTokenIntoSerializedEntry,
  installTokenStorageGuard,
} from '../src/composables/useTokenStorageSync.js';

/** Storage fake mínimo (Map por baixo) — Node não tem localStorage
 *  garantido em todas as versões/flags, então não dependemos dele. */
function createFakeStorage(initial = {}) {
  const map = new Map(Object.entries(initial));
  return {
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => map.set(key, value),
    removeItem: (key) => map.delete(key),
    _dump: () => Object.fromEntries(map),
  };
}

test('authStorageKey monta a mesma chave que o Scalar usa de verdade', () => {
  assert.equal(authStorageKey('auth'), 'scalar-reference-auth-auth');
  assert.equal(authStorageKey('rhnetsocial'), 'scalar-reference-auth-rhnetsocial');
});

test('readAuthEntry volta vazio (no formato certo) quando a chave não existe', () => {
  const storage = createFakeStorage();
  assert.deepEqual(readAuthEntry(storage, 'auth'), { secrets: {}, selected: {} });
});

test('readAuthEntry volta vazio (sem lançar) quando o valor salvo está corrompido', () => {
  const storage = createFakeStorage({ 'scalar-reference-auth-auth': '{not valid json' });
  assert.deepEqual(readAuthEntry(storage, 'auth'), { secrets: {}, selected: {} });
});

test('writeTokenToScheme preserva username/password existentes do Basic ao gravar noutro scheme', () => {
  const storage = createFakeStorage({
    'scalar-reference-auth-auth': JSON.stringify({
      secrets: {
        'Gerar JWT': {
          type: 'http',
          'x-scalar-secret-token': '',
          'x-scalar-secret-username': 'parceiro-123',
          'x-scalar-secret-password': 'cliente-456',
        },
      },
      selected: { document: { selectedIndex: 0, selectedSchemes: [{ 'Gerar JWT': [] }] } },
    }),
  });

  writeTokenToScheme(storage, 'auth', 'Atualizar JWT', 'jwt-novo-123');

  const saved = JSON.parse(storage.getItem('scalar-reference-auth-auth'));

  // "Gerar JWT" continua intacto.
  assert.equal(saved.secrets['Gerar JWT']['x-scalar-secret-username'], 'parceiro-123');
  assert.equal(saved.secrets['Gerar JWT']['x-scalar-secret-password'], 'cliente-456');

  // "Atualizar JWT" foi criado com o token novo.
  assert.equal(saved.secrets['Atualizar JWT']['x-scalar-secret-token'], 'jwt-novo-123');
  assert.equal(saved.secrets['Atualizar JWT'].type, 'http');

  // `selected` não foi tocado — de propósito, ver comentário no módulo.
  assert.deepEqual(saved.selected, { document: { selectedIndex: 0, selectedSchemes: [{ 'Gerar JWT': [] }] } });
});

test('writeTokenToScheme atualiza (não duplica) quando o scheme já existe', () => {
  const storage = createFakeStorage({
    'scalar-reference-auth-rhnetsocial': JSON.stringify({
      secrets: { bearerAuth: { type: 'http', 'x-scalar-secret-token': 'token-velho' } },
      selected: {},
    }),
  });

  writeTokenToScheme(storage, 'rhnetsocial', 'bearerAuth', 'token-novo');

  const saved = JSON.parse(storage.getItem('scalar-reference-auth-rhnetsocial'));
  assert.equal(Object.keys(saved.secrets).length, 1);
  assert.equal(saved.secrets.bearerAuth['x-scalar-secret-token'], 'token-novo');
});

test('getTokenStorageTargets() inclui Auth→"Atualizar JWT" e RH Net Social→"bearerAuth"', () => {
  const targets = getTokenStorageTargets();
  assert.ok(targets.some((t) => t.slug === 'auth' && t.schemeName === 'Atualizar JWT'));
  assert.ok(targets.some((t) => t.slug === 'rhnetsocial' && t.schemeName === 'bearerAuth'));
  // "Gerar JWT" nunca deveria ser alvo — não tem prefill de token.
  assert.equal(targets.some((t) => t.schemeName === 'Gerar JWT'), false);
});

test('syncTokenToStorage grava o token em todos os alvos descobertos, num storage vazio', () => {
  const storage = createFakeStorage();

  syncTokenToStorage(storage, 'jwt-sincronizado');

  const auth = JSON.parse(storage.getItem('scalar-reference-auth-auth'));
  const rh = JSON.parse(storage.getItem('scalar-reference-auth-rhnetsocial'));

  assert.equal(auth.secrets['Atualizar JWT']['x-scalar-secret-token'], 'jwt-sincronizado');
  assert.equal(rh.secrets.bearerAuth['x-scalar-secret-token'], 'jwt-sincronizado');
});

test('syncTokenToStorage não lança com storage ou token ausente', () => {
  assert.doesNotThrow(() => syncTokenToStorage(undefined, 'token'));
  assert.doesNotThrow(() => syncTokenToStorage(createFakeStorage(), null));
});

test('getMultiSchemeDocuments() encontra a auth (2 schemes) e não inclui a RH Net Social (1 scheme)', () => {
  const docs = getMultiSchemeDocuments();
  const authDoc = docs.find((d) => d.slug === 'auth');
  assert.ok(authDoc);
  assert.deepEqual(authDoc.schemeNames.sort(), ['Atualizar JWT', 'Gerar JWT'].sort());
  assert.equal(docs.some((d) => d.slug === 'rhnetsocial'), false);
});

test('ensureDocumentSelectedSchemes cria selected.document do zero quando a chave não existe', () => {
  const storage = createFakeStorage();

  ensureDocumentSelectedSchemes(storage, 'auth', ['Gerar JWT', 'Atualizar JWT']);

  const saved = JSON.parse(storage.getItem('scalar-reference-auth-auth'));
  assert.deepEqual(saved.selected.document, {
    selectedIndex: 0,
    selectedSchemes: [{ 'Gerar JWT': [] }, { 'Atualizar JWT': [] }],
  });
});

test('ensureDocumentSelectedSchemes regenera quando selected.document existe mas está vazio (o caso real relatado: clique acidental no dropdown)', () => {
  const storage = createFakeStorage({
    'scalar-reference-auth-auth': JSON.stringify({
      secrets: {},
      selected: { document: { selectedIndex: 0, selectedSchemes: [] } },
    }),
  });

  ensureDocumentSelectedSchemes(storage, 'auth', ['Gerar JWT', 'Atualizar JWT']);

  const saved = JSON.parse(storage.getItem('scalar-reference-auth-auth'));
  assert.equal(saved.selected.document.selectedSchemes.length, 2);
});

test('ensureDocumentSelectedSchemes regenera quando só 1 dos 2 schemes está presente', () => {
  const storage = createFakeStorage({
    'scalar-reference-auth-auth': JSON.stringify({
      secrets: {},
      selected: { document: { selectedIndex: 0, selectedSchemes: [{ 'Gerar JWT': [] }] } },
    }),
  });

  ensureDocumentSelectedSchemes(storage, 'auth', ['Gerar JWT', 'Atualizar JWT']);

  const saved = JSON.parse(storage.getItem('scalar-reference-auth-auth'));
  assert.equal(saved.selected.document.selectedSchemes.length, 2);
});

test('ensureDocumentSelectedSchemes NÃO reescreve quando já está correto (evita escrita desnecessária)', () => {
  const original = JSON.stringify({
    secrets: { 'Gerar JWT': { type: 'http', 'x-scalar-secret-token': '', 'x-scalar-secret-username': 'x', 'x-scalar-secret-password': 'y' } },
    selected: { document: { selectedIndex: 0, selectedSchemes: [{ 'Gerar JWT': [] }, { 'Atualizar JWT': [] }] } },
  });
  const storage = createFakeStorage({ 'scalar-reference-auth-auth': original });

  ensureDocumentSelectedSchemes(storage, 'auth', ['Gerar JWT', 'Atualizar JWT']);

  assert.equal(storage.getItem('scalar-reference-auth-auth'), original, 'não deveria ter regravado a chave');
});

test('ensureDocumentSelectedSchemes nunca mexe em secrets (credenciais já digitadas sobrevivem)', () => {
  const storage = createFakeStorage({
    'scalar-reference-auth-auth': JSON.stringify({
      secrets: {
        'Gerar JWT': { type: 'http', 'x-scalar-secret-token': '', 'x-scalar-secret-username': 'parceiro', 'x-scalar-secret-password': 'cliente' },
      },
      selected: { document: { selectedIndex: 0, selectedSchemes: [] } },
    }),
  });

  ensureDocumentSelectedSchemes(storage, 'auth', ['Gerar JWT', 'Atualizar JWT']);

  const saved = JSON.parse(storage.getItem('scalar-reference-auth-auth'));
  assert.equal(saved.secrets['Gerar JWT']['x-scalar-secret-username'], 'parceiro');
  assert.equal(saved.secrets['Gerar JWT']['x-scalar-secret-password'], 'cliente');
});

test('ensureAllMultiSchemeSelections aplica em todos os documentos multi-scheme do manifesto, sem lançar sem storage', () => {
  assert.doesNotThrow(() => ensureAllMultiSchemeSelections(undefined));

  const storage = createFakeStorage();
  ensureAllMultiSchemeSelections(storage);

  const saved = JSON.parse(storage.getItem('scalar-reference-auth-auth'));
  assert.equal(saved.selected.document.selectedSchemes.length, 2);
});

test('mergeTokenIntoSerializedEntry aplica o token preservando o resto, e lida com valor ausente/corrompido', () => {
  const merged = mergeTokenIntoSerializedEntry(
    JSON.stringify({
      secrets: { 'Gerar JWT': { type: 'http', 'x-scalar-secret-username': 'u', 'x-scalar-secret-password': 'p' } },
      selected: { document: { selectedIndex: 0, selectedSchemes: [{ 'Gerar JWT': [] }] } },
    }),
    ['Atualizar JWT'],
    'token-x'
  );
  const parsed = JSON.parse(merged);
  assert.equal(parsed.secrets['Atualizar JWT']['x-scalar-secret-token'], 'token-x');
  assert.equal(parsed.secrets['Gerar JWT']['x-scalar-secret-username'], 'u');
  assert.deepEqual(parsed.selected.document.selectedSchemes, [{ 'Gerar JWT': [] }]);

  // Sem lançar com valor ausente ou corrompido.
  assert.doesNotThrow(() => mergeTokenIntoSerializedEntry(null, ['Atualizar JWT'], 'x'));
  assert.doesNotThrow(() => mergeTokenIntoSerializedEntry('{not json', ['Atualizar JWT'], 'x'));
});

test('installTokenStorageGuard: reaplica o token quando o PRÓPRIO Scalar escreve depois, sem saber do token (a corrida real)', () => {
  const storage = createFakeStorage();
  const state = { token: null };

  installTokenStorageGuard(storage, state);

  // 1) Capturamos o token (como o useTokenBridge.js faz de verdade).
  state.token = 'token-capturado';
  storage.setItem('scalar-reference-auth-auth', mergeTokenIntoSerializedEntry(null, ['Atualizar JWT'], state.token));

  let saved = JSON.parse(storage.getItem('scalar-reference-auth-auth'));
  assert.equal(saved.secrets['Atualizar JWT']['x-scalar-secret-token'], 'token-capturado');

  // 2) O PRÓPRIO Scalar escreve por cima, mais tarde (simulando o
  //    autosave debounced dele) — SEM saber do nosso token, só
  //    persistindo o que ele tem em memória (username/password que a
  //    pessoa digitou em "Gerar JWT"). Sem o guard, isso apagaria
  //    nosso token.
  storage.setItem(
    'scalar-reference-auth-auth',
    JSON.stringify({
      secrets: { 'Gerar JWT': { type: 'http', 'x-scalar-secret-username': 'parceiro', 'x-scalar-secret-password': 'cliente' } },
      selected: { document: { selectedIndex: 0, selectedSchemes: [{ 'Gerar JWT': [] }, { 'Atualizar JWT': [] }] } },
    })
  );

  saved = JSON.parse(storage.getItem('scalar-reference-auth-auth'));
  // O token sobrevive, reaplicado por cima da escrita do Scalar.
  assert.equal(saved.secrets['Atualizar JWT']['x-scalar-secret-token'], 'token-capturado');
  // E o que o Scalar escreveu (usuário/senha do Basic) também sobrevive.
  assert.equal(saved.secrets['Gerar JWT']['x-scalar-secret-username'], 'parceiro');
});

test('installTokenStorageGuard: não mexe em chaves fora do alvo (ex.: colorMode, outras preferências do Scalar)', () => {
  const storage = createFakeStorage();
  const state = { token: 'algum-token' };

  installTokenStorageGuard(storage, state);
  storage.setItem('colorMode', 'dark');

  assert.equal(storage.getItem('colorMode'), 'dark');
});

test('installTokenStorageGuard: sem token capturado ainda, não interfere na escrita normal', () => {
  const storage = createFakeStorage();
  const state = { token: null };

  installTokenStorageGuard(storage, state);
  storage.setItem('scalar-reference-auth-auth', JSON.stringify({ secrets: {}, selected: {} }));

  const saved = JSON.parse(storage.getItem('scalar-reference-auth-auth'));
  assert.equal('Atualizar JWT' in saved.secrets, false);
});

test('installTokenStorageGuard: limpa a entrada solta __tokenBridgeGuardInstalled de uma versão anterior', () => {
  const storage = createFakeStorage({ __tokenBridgeGuardInstalled: 'true' });
  const state = { token: null };

  installTokenStorageGuard(storage, state);

  assert.equal(storage.getItem('__tokenBridgeGuardInstalled'), null);
});

test('installTokenStorageGuard: instalar duas vezes não gera dupla aplicação, e a função de desinstalar funciona', () => {
  const storage = createFakeStorage();
  const state = { token: 'token-x' };

  const uninstall1 = installTokenStorageGuard(storage, state);
  const uninstall2 = installTokenStorageGuard(storage, state); // segunda chamada: no-op

  assert.equal(typeof uninstall1, 'function');
  assert.equal(typeof uninstall2, 'function');

  uninstall1();
  // Depois de desinstalado, escrever não deveria mais reaplicar o token.
  storage.setItem('scalar-reference-auth-auth', JSON.stringify({ secrets: {}, selected: {} }));
  const saved = JSON.parse(storage.getItem('scalar-reference-auth-auth'));
  assert.equal('Atualizar JWT' in saved.secrets, false);
});
