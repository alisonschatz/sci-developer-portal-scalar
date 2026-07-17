import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  getBearerTokenConsumerServers,
  isRequestLike,
  requestUrl,
  matchesAnyServer,
  readAuthorizationHeader,
  needsBearerPatch,
  buildPatchedRequest,
  extractToken,
  createTokenBridgeFetch,
} from '../src/composables/useTokenBridge.js';

test('getBearerTokenConsumerServers() inclui a RH Net Social (securityScheme simples) E a própria auth (Atualizar JWT tem prefill de token)', () => {
  const servers = getBearerTokenConsumerServers();
  assert.ok(servers.includes('https://api2.rhnetsocial.com.br'));
  // A auth agora ENTRA na lista — "Atualizar JWT" tem prefill de token
  // (precisa do token atual pra renovar). Só "Gerar JWT" (Basic, sem
  // prefill) fica de fora — mas isso não afeta esta lista, que é por
  // SERVER, não por scheme (ver teste abaixo sobre needsBearerPatch
  // não mexer no header Basic do login).
  assert.ok(servers.includes('https://api-auth.sci.com.br'));
});

test('isRequestLike reconhece um Request de verdade e rejeita string/objeto qualquer', () => {
  const req = new Request('https://x/y', { headers: { Accept: 'application/json' } });
  assert.equal(isRequestLike(req), true);
  assert.equal(isRequestLike('https://x/y'), false);
  assert.equal(isRequestLike({ url: 'https://x/y' }), false); // sem .headers, não é Request-like o bastante
  assert.equal(isRequestLike(null), false);
});

test('requestUrl aceita string e Request de verdade', () => {
  assert.equal(requestUrl('https://x/y'), 'https://x/y');
  assert.equal(requestUrl(new Request('https://x/y')), 'https://x/y');
  assert.equal(requestUrl(undefined), null);
});

test('matchesAnyServer casa por prefixo', () => {
  const servers = ['https://api2.rhnetsocial.com.br'];
  assert.equal(matchesAnyServer('https://api2.rhnetsocial.com.br/api/v1/feriados', servers), true);
  assert.equal(matchesAnyServer('https://outra-api.com.br/x', servers), false);
  assert.equal(matchesAnyServer(null, servers), false);
});

test('readAuthorizationHeader lê do Request (chamada de 1 argumento — o caso real do Scalar no navegador)', () => {
  const req = new Request('https://x/y', { headers: { Authorization: 'Bearer abc' } });
  assert.equal(readAuthorizationHeader(req, undefined), 'Bearer abc');
});

test('readAuthorizationHeader lê do init (chamada de 2 argumentos — Electron/testes)', () => {
  assert.equal(readAuthorizationHeader('https://x/y', { headers: { Authorization: 'Bearer abc' } }), 'Bearer abc');
});

test('readAuthorizationHeader retorna null quando não há header em nenhum dos dois', () => {
  assert.equal(readAuthorizationHeader(new Request('https://x/y'), undefined), null);
  assert.equal(readAuthorizationHeader('https://x/y', undefined), null);
});

test('needsBearerPatch: precisa corrigir quando ausente, vazio, ou o placeholder não resolvido', () => {
  const placeholder = '{{sci_auth_token}}';
  assert.equal(needsBearerPatch(null, placeholder), true);
  assert.equal(needsBearerPatch('', placeholder), true);
  assert.equal(needsBearerPatch('Bearer', placeholder), true);
  assert.equal(needsBearerPatch('Bearer ', placeholder), true);
  assert.equal(needsBearerPatch('Bearer {{sci_auth_token}}', placeholder), true);
});

test('needsBearerPatch: NÃO mexe quando já existe um valor real (respeita preenchimento manual)', () => {
  const placeholder = '{{sci_auth_token}}';
  assert.equal(needsBearerPatch('Bearer eyJhbGciOiJIUzI1NiJ9.real.token', placeholder), false);
  assert.equal(needsBearerPatch('Basic dXNlcjpwYXNz', placeholder), false);
});

test('buildPatchedRequest com um Request de verdade: preserva method, body e OUTROS headers — só troca o Authorization', async () => {
  const original = new Request('https://api2.rhnetsocial.com.br/api/v1/funcionario/preliminar', {
    method: 'POST',
    headers: {
      Authorization: '{{sci_auth_token}}',
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ nome: 'Teste' }),
  });

  const { input: patched, init } = buildPatchedRequest(original, undefined, 'token-real-123');

  assert.equal(init, undefined, 'não deveria devolver um init separado quando o input já é um Request');
  assert.ok(patched instanceof Request);
  assert.equal(patched.method, 'POST');
  assert.equal(patched.headers.get('Authorization'), 'Bearer token-real-123');
  // Os OUTROS headers precisam sobreviver — é exatamente o que quebrava
  // na versão anterior (headers eram substituídos por completo).
  assert.equal(patched.headers.get('Accept'), 'application/json');
  assert.equal(patched.headers.get('Content-Type'), 'application/json');
  assert.equal(await patched.clone().text(), JSON.stringify({ nome: 'Teste' }));
});

test('buildPatchedRequest com (url, init) de dois argumentos: continua funcionando (Electron/testes)', () => {
  const { input, init } = buildPatchedRequest('https://x/y', { headers: { Accept: 'application/json' } }, 'token-abc');
  assert.equal(input, 'https://x/y');
  const headers = new Headers(init.headers);
  assert.equal(headers.get('Authorization'), 'Bearer token-abc');
  assert.equal(headers.get('Accept'), 'application/json');
});

test('extractToken pega o campo certo e ignora valores não-string', () => {
  assert.equal(extractToken({ token: 'abc' }, 'token'), 'abc');
  assert.equal(extractToken({ token: 123 }, 'token'), null);
  assert.equal(extractToken({}, 'token'), null);
  assert.equal(extractToken(null, 'token'), null);
});

test('createTokenBridgeFetch: fluxo completo com chamada de 1 argumento (Request) — o caso real do Scalar no navegador', async () => {
  const calls = [];
  const fakeFetch = async function (requestArg) {
    // Confirma que SÓ recebemos 1 argumento nesta simulação — é
    // exatamente isso que o send-request.js real do Scalar faz.
    assert.equal(arguments.length, 1);
    calls.push({ url: requestArg.url, authHeader: requestArg.headers.get('Authorization') });

    if (requestArg.url === 'https://api-auth.sci.com.br/api/v1/auth/credencial/login') {
      return new Response(JSON.stringify({ token: 'jwt-de-teste-123' }), {
        status: 201,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    return new Response('{}', { status: 200 });
  };

  const { tokenBridgeFetch, state } = createTokenBridgeFetch({ fetchImpl: fakeFetch });

  // 1) Login — chamada de 1 argumento, como o Scalar faz de verdade.
  const loginRequest = new Request('https://api-auth.sci.com.br/api/v1/auth/credencial/login', {
    method: 'POST',
    headers: { Authorization: 'Basic dXNlcjpwYXNz' },
  });
  await tokenBridgeFetch(loginRequest);

  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(state.token, 'jwt-de-teste-123');

  // 2) Chamada à RH Net Social — também com 1 argumento só, com o
  //    Authorization ainda como placeholder não resolvido.
  const rhRequest = new Request('https://api2.rhnetsocial.com.br/api/v1/feriados', {
    method: 'GET',
    headers: { Authorization: 'Bearer {{sci_auth_token}}', Accept: 'application/json' },
  });
  await tokenBridgeFetch(rhRequest);

  assert.equal(calls[1].url, 'https://api2.rhnetsocial.com.br/api/v1/feriados');
  assert.equal(
    calls[1].authHeader,
    'Bearer jwt-de-teste-123',
    'a ponte deve ter corrigido o header ANTES de chamar o fetch real, preservando o resto da requisição'
  );
});

test('createTokenBridgeFetch: não mexe em requisições para servers fora do manifesto (ex.: carregar o próprio spec)', async () => {
  let receivedAuthHeader = 'não deveria mudar';
  const fakeFetch = async (requestArg) => {
    receivedAuthHeader = requestArg.headers.get('Authorization');
    return new Response('{}', { status: 200 });
  };

  const { tokenBridgeFetch, state } = createTokenBridgeFetch({ fetchImpl: fakeFetch });
  state.token = 'algum-token';

  await tokenBridgeFetch(new Request('https://sci-developer-portal.example/openapi/rhnetsocial.json'));

  assert.equal(receivedAuthHeader, null);
});

test('createTokenBridgeFetch: corrige a PRÓPRIA chamada de refresh da auth (Bearer), mas nunca mexe na de login (Basic)', async () => {
  const calls = [];
  const fakeFetch = async function (requestArg) {
    calls.push({ url: requestArg.url, authHeader: requestArg.headers.get('Authorization') });
    if (requestArg.url.includes('/credencial/login')) {
      return new Response(JSON.stringify({ token: 'token-do-login' }), { status: 201 });
    }
    return new Response('{}', { status: 200 });
  };

  const { tokenBridgeFetch } = createTokenBridgeFetch({ fetchImpl: fakeFetch });

  // 1) Login com Basic real — não deveria ser tocado.
  await tokenBridgeFetch(
    new Request('https://api-auth.sci.com.br/api/v1/auth/credencial/login', {
      method: 'POST',
      headers: { Authorization: 'Basic dXNlcjpwYXNz' },
    })
  );
  await new Promise((resolve) => setTimeout(resolve, 0));

  // 2) Refresh, na MESMA API (auth) — com o placeholder não resolvido,
  //    exatamente como o Scalar deixaria antes da correção.
  await tokenBridgeFetch(
    new Request('https://api-auth.sci.com.br/api/v1/auth/refresh', {
      method: 'POST',
      headers: { Authorization: 'Bearer {{sci_auth_token}}' },
    })
  );

  assert.equal(calls[0].authHeader, 'Basic dXNlcjpwYXNz', 'login não deveria ser mexido');
  assert.equal(calls[1].authHeader, 'Bearer token-do-login', 'refresh deveria ter sido corrigido com o token do login');
});

test('createTokenBridgeFetch: nunca sobrescreve um Authorization real já presente (respeita preenchimento manual)', async () => {
  let receivedAuthHeader = null;
  const fakeFetch = async (requestArg) => {
    receivedAuthHeader = requestArg.headers.get('Authorization');
    return new Response('{}', { status: 200 });
  };

  const { tokenBridgeFetch, state } = createTokenBridgeFetch({ fetchImpl: fakeFetch });
  state.token = 'token-capturado';

  const request = new Request('https://api2.rhnetsocial.com.br/api/v1/feriados', {
    headers: { Authorization: 'Bearer token-digitado-manualmente' },
  });
  await tokenBridgeFetch(request);

  assert.equal(receivedAuthHeader, 'Bearer token-digitado-manualmente');
});

test('createTokenBridgeFetch: ao capturar o token, também sincroniza com o localStorage (para a próxima ativação de documento)', async () => {
  const storageMap = new Map();
  const fakeStorage = {
    getItem: (key) => (storageMap.has(key) ? storageMap.get(key) : null),
    setItem: (key, value) => storageMap.set(key, value),
  };

  const fakeFetch = async (requestArg) => {
    if (requestArg.url.includes('/login')) {
      return new Response(JSON.stringify({ token: 'jwt-pra-storage' }), { status: 201 });
    }
    return new Response('{}', { status: 200 });
  };

  const { tokenBridgeFetch } = createTokenBridgeFetch({ fetchImpl: fakeFetch, storageImpl: fakeStorage });

  await tokenBridgeFetch(new Request('https://api-auth.sci.com.br/api/v1/auth/credencial/login', { method: 'POST' }));
  await new Promise((resolve) => setTimeout(resolve, 0));

  const authEntry = JSON.parse(fakeStorage.getItem('scalar-reference-auth-auth'));
  const rhEntry = JSON.parse(fakeStorage.getItem('scalar-reference-auth-rhnetsocial'));

  assert.equal(authEntry.secrets['Atualizar JWT']['x-scalar-secret-token'], 'jwt-pra-storage');
  assert.equal(rhEntry.secrets.bearerAuth['x-scalar-secret-token'], 'jwt-pra-storage');
});
