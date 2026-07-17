import { apis, getAuthProvider, SHARED_TOKEN_VARIABLE } from '../../apis.manifest.js';
import { syncTokenToStorage } from './useTokenStorageSync.js';

/**
 * "Ponte" de token — substitui a dependência de `pm.globals` persistir
 * entre requisições (que não funciona nesta versão do Scalar: o store
 * interno é recriado do zero a cada requisição — ver
 * node_modules/@scalar/workspace-store/dist/request-example/variable-store/index.js,
 * `createVariablesStoreForRequest()` — e a issue scalar/scalar#7161,
 * "Map authentication config to the new store").
 *
 * ⚠️ DETALHE CRÍTICO, confirmado direto no código-fonte do Scalar
 * (`node_modules/@scalar/api-client/dist/v2/blocks/operation-block/helpers/send-request.js`):
 *
 *   const response = isElectron()
 *     ? await customFetch(...requestPayload)
 *     : await customFetch(request ?? buildSafeBodyRequest(...requestPayload));
 *
 * No navegador (não-Electron — nosso caso), `customFetch` é chamado com
 * **UM ÚNICO ARGUMENTO**: um `Request` já pronto (`buildSafeBodyRequest`
 * também sempre retorna um `new Request(...)` — conferido em
 * `node_modules/@scalar/helpers/dist/http/can-method-have-body.js`).
 * Não é `customFetch(url, init)`. Uma primeira versão desta ponte
 * assumia dois argumentos — `init` chegava sempre `undefined`, e pior:
 * ao "corrigir" o header, construía um objeto novo só com
 * `{ headers: <Authorization> }`, o que — via `fetch(request, init)` —
 * SUBSTITUI todos os headers da requisição original (Content-Type,
 * Accept, etc.), não só adiciona o Authorization. Por isso o fix
 * anterior não funcionava (e provavelmente quebrava a requisição de
 * outro jeito, silenciosamente).
 *
 * A correção: quando `input` é um `Request` de verdade, construímos um
 * `new Request(input, { headers })` com os headers ORIGINAIS clonados e
 * só o Authorization sobrescrito — preserva method/body/mode/credentials
 * e todo o resto. O caso `(url, init)` de dois argumentos continua
 * suportado à parte (Electron, ou uso direto/testes), sem depender de
 * qual formato o Scalar realmente usa hoje.
 *
 * O campo de autenticação na tela continua mostrando `{{sci_auth_token}}`
 * como texto — isso é esperado (é assim que templating aparece em
 * qualquer cliente estilo Postman, resolvido só no envio). O que muda é
 * que a REQUISIÇÃO ENVIADA passa a carregar o token de verdade.
 *
 * Sem nenhuma UI — nada aparece na tela, é 100% automático e silencioso.
 */

const AUTH_HEADER = 'Authorization';

/** Servers das APIs que devem receber o token compartilhado via Bearer —
 *  derivado do manifesto, nunca hardcoded. Cobre tanto o caso simples
 *  (`securityScheme`, que sempre gera prefill com `token`) quanto o caso
 *  rico (`securitySchemes`, só entra se algum scheme tiver prefill com
 *  `token`).
 *
 *  Inclui a PRÓPRIA API auth quando algum scheme dela tem prefill de
 *  token — hoje, "Atualizar JWT" (Bearer, usa o token atual pra
 *  renovar). Uma versão anterior pulava a auth incondicionalmente
 *  (`if (api.isAuthProvider) continue`), pensando só no caso de "Gerar
 *  JWT" (Basic, sem token pra corrigir) — mas isso também deixava a
 *  chamada de refresh sem correção nenhuma na requisição em si (só o
 *  preenchimento do storage, decisão 16, cobria esse caso — e só
 *  aparece depois de trocar de documento/recarregar). A mesma checagem
 *  de `hasBearerPrefill`, sem a exclusão, já resolve os dois schemes da
 *  auth corretamente: "Gerar JWT" nunca entra (não tem prefill de
 *  token), "Atualizar JWT" entra sozinho. Ver docs/arquitetura.md,
 *  decisão 18. */
export function getBearerTokenConsumerServers() {
  const servers = [];
  for (const api of apis) {
    if (api.securityScheme) {
      servers.push(api.serverUrl);
    } else if (api.securitySchemes) {
      const hasBearerPrefill = api.securitySchemes.some((s) => s.prefill && 'token' in s.prefill);
      if (hasBearerPrefill) servers.push(api.serverUrl);
    }
  }
  return servers;
}

/** true se o valor parece um objeto Request de verdade (ou Request-like
 *  o bastante para o que precisamos: .url e .headers). Não usamos só
 *  `instanceof Request` para não depender de que seja exatamente a
 *  MESMA classe Request do realm/iframe atual — checagem estrutural é
 *  mais robusta. */
export function isRequestLike(value) {
  return Boolean(value && typeof value === 'object' && typeof value.url === 'string' && typeof value.headers === 'object');
}

/** Extrai a URL de uma chamada de fetch, aceitando string ou Request-like. */
export function requestUrl(input) {
  if (typeof input === 'string') return input;
  if (isRequestLike(input)) return input.url;
  return null;
}

/** true se a URL começa com algum dos servers passados. */
export function matchesAnyServer(url, servers) {
  if (!url) return false;
  return servers.some((server) => url.startsWith(server));
}

/** Lê o Authorization de onde quer que ele esteja — no Request (chamada
 *  de 1 argumento) ou no init (chamada de 2 argumentos). */
export function readAuthorizationHeader(input, init) {
  if (isRequestLike(input) && input.headers && typeof input.headers.get === 'function') {
    return input.headers.get(AUTH_HEADER);
  }
  if (init && init.headers) {
    return new Headers(init.headers).get(AUTH_HEADER);
  }
  return null;
}

/** true se o header atual precisa ser corrigido: ausente, vazio (só
 *  "Bearer" sem valor), ou o placeholder de template não resolvido. */
export function needsBearerPatch(existingHeader, placeholder) {
  if (!existingHeader) return true;
  const trimmed = existingHeader.trim();
  if (trimmed === '' || trimmed === 'Bearer' || trimmed === 'Bearer ') return true;
  if (trimmed.includes(placeholder)) return true;
  return false;
}

/**
 * Monta a versão corrigida de (input, init) — preservando TUDO do
 * original (headers, method, body, mode, credentials) e só
 * sobrescrevendo o Authorization. Retorna sempre `{ input, init }`, no
 * formato certo pra chamar `fetchImpl(input, init)` (com `init`
 * possivelmente `undefined`, no caso Request-only).
 */
export function buildPatchedRequest(input, init, token, RequestCtor = Request) {
  if (isRequestLike(input)) {
    const headers = new Headers(input.headers);
    headers.set(AUTH_HEADER, `Bearer ${token}`);
    // new Request(input, { headers }) preserva method/body/mode/credentials
    // do Request original — troca só os headers (headers em init SEMPRE
    // substitui os do input, nunca faz merge parcial, por isso clonamos
    // primeiro em vez de passar só { Authorization: ... }).
    return { input: new RequestCtor(input, { headers }), init: undefined };
  }

  const headers = new Headers(init && init.headers ? init.headers : undefined);
  headers.set(AUTH_HEADER, `Bearer ${token}`);
  return { input, init: { ...(init || {}), headers } };
}

/** Extrai o token de um corpo de resposta JSON, dado o nome do campo. */
export function extractToken(body, field) {
  const value = body && field ? body[field] : undefined;
  return typeof value === 'string' && value ? value : null;
}

/**
 * Cria a função customFetch. Recebe o token capturado por referência
 * (um objeto mutável) para poder ser testada sem depender de estado
 * de módulo global. `RequestCtor` é injetável para os testes rodarem
 * em Node sem depender de detalhes de uma implementação real de
 * `Request` (o `undici`/Node já tem `Request` global, mas manter
 * injetável evita acoplamento desnecessário).
 */
export function createTokenBridgeFetch({
  fetchImpl = window.fetch.bind(window),
  state = { token: null },
  RequestCtor = typeof Request !== 'undefined' ? Request : undefined,
  storageImpl = typeof window !== 'undefined' ? window.localStorage : undefined,
} = {}) {
  const provider = getAuthProvider();
  const bearerConsumerServers = getBearerTokenConsumerServers();
  const placeholder = `{{${SHARED_TOKEN_VARIABLE}}}`;

  async function tokenBridgeFetch(input, init) {
    const url = requestUrl(input);

    let finalInput = input;
    let finalInit = init;

    if (state.token && matchesAnyServer(url, bearerConsumerServers)) {
      const existing = readAuthorizationHeader(input, init);
      if (needsBearerPatch(existing, placeholder)) {
        const patched = buildPatchedRequest(input, init, state.token, RequestCtor);
        finalInput = patched.input;
        finalInit = patched.init;
      }
    }

    // Preserva a mesma "aridade" da chamada original — chamar
    // fetch(request, undefined) explicitamente é equivalente a
    // fetch(request), mas manter a forma exata evita qualquer
    // comportamento diferente em implementações mais estritas de fetch.
    const response = finalInit === undefined ? await fetchImpl(finalInput) : await fetchImpl(finalInput, finalInit);

    try {
      if (url && url.startsWith(provider.serverUrl) && response.ok) {
        response
          .clone()
          .json()
          .then((body) => {
            const token = extractToken(body, provider.tokenResponseField);
            if (token) {
              state.token = token;
              syncTokenToStorage(storageImpl, token);
            }
          })
          .catch(() => {});
      }
    } catch {
      // Nunca deixa a ponte quebrar uma requisição de verdade.
    }

    return response;
  }

  return { tokenBridgeFetch, state };
}
