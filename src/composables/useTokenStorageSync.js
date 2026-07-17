import { apis, getAuthProvider } from '../../apis.manifest.js';

/**
 * Grava o token compartilhado diretamente no localStorage, no mesmo
 * formato e na mesma chave que o próprio Scalar usa para persistir
 * autenticação — confirmado direto no código-fonte:
 *
 *   node_modules/@scalar/helpers/dist/object/local-storage.js
 *     REFERENCE_LS_KEYS.AUTH = 'scalar-reference-auth'
 *
 *   node_modules/@scalar/api-reference/dist/helpers/storage.js
 *     getKey(slug) => `${REFERENCE_LS_KEYS.AUTH}-${slug}`
 *
 *   node_modules/@scalar/workspace-store/dist/entities/auth/schema.js
 *     secrets[schemeName] = { type: 'http', 'x-scalar-secret-token',
 *                              'x-scalar-secret-username', 'x-scalar-secret-password' }
 *     selected.document = { selectedIndex, selectedSchemes: SecurityRequirement[] }
 *
 * Por quê isso, e não só a ponte de customFetch (useTokenBridge.js): o
 * Scalar só RELÊ essa chave quando um documento é ativado/selecionado
 * (`loadAuthFromStorage`, em ApiReference.vue.script.js) — não
 * reativamente enquanto a página já está aberta. Escrever aqui garante
 * que, na PRÓXIMA vez que o documento for ativado (trocar de aba, ou
 * carregar a página de novo), o campo já apareça com o token de
 * verdade — em vez do placeholder `{{sci_auth_token}}` sem resolver.
 *
 * `ensureAllMultiSchemeSelections()` cobre um caso diferente,
 * descoberto testando na prática: a simples EXISTÊNCIA de
 * `selected.document` (mesmo com `selectedSchemes: []` vazio — ex.:
 * alguém seleciona e desseleciona um scheme no dropdown do topo, sem
 * querer) desliga o cálculo automático de "Required" por operação. A
 * decisão consciente aqui (ver docs/arquitetura.md, decisão 17): manter
 * `selected.document` sempre com os DOIS schemes da Auth presentes —
 * o topo do documento nunca fica "No authentication selected", ao
 * custo de cada operação não escolher mais sozinha o seu Required
 * (usuário alterna manualmente entre as duas — já confirmado que
 * funciona bem). Autocura: se a chave for apagada, ou ficar sem os dois
 * schemes, a próxima carga da página regenera.
 */

const AUTH_KEY_PREFIX = 'scalar-reference-auth';

/** Mesma chave que o Scalar usa: `scalar-reference-auth-<slug>`. */
export function authStorageKey(slug) {
  return `${AUTH_KEY_PREFIX}-${slug}`;
}

/** Lê a entrada de auth persistida pro slug — nunca lança; volta vazio
 *  (no formato esperado) se não existir ou vier corrompida. */
export function readAuthEntry(storage, slug) {
  try {
    const raw = storage.getItem(authStorageKey(slug));
    if (!raw) return { secrets: {}, selected: {} };
    const parsed = JSON.parse(raw);
    return {
      secrets: parsed && typeof parsed.secrets === 'object' ? parsed.secrets : {},
      selected: parsed && typeof parsed.selected === 'object' ? parsed.selected : {},
    };
  } catch {
    return { secrets: {}, selected: {} };
  }
}

/** Grava o token no campo x-scalar-secret-token do scheme indicado,
 *  preservando tudo o mais que já estava salvo (username/password do
 *  Basic, outros schemes, e o `selected` inteiro, intocado). */
export function writeTokenToScheme(storage, slug, schemeName, token) {
  const entry = readAuthEntry(storage, slug);
  const existingScheme = entry.secrets[schemeName] || { type: 'http' };

  const updated = {
    ...entry,
    secrets: {
      ...entry.secrets,
      [schemeName]: {
        ...existingScheme,
        'x-scalar-secret-token': token,
      },
    },
  };

  storage.setItem(authStorageKey(slug), JSON.stringify(updated));
}

/**
 * Descobre, a partir do manifesto, todo (slug, schemeName) que precisa
 * receber o token compartilhado — a própria Auth (schemes com prefill
 * de `token`, hoje "Atualizar JWT") e cada API consumidora
 * (`securityScheme` simples, ou `securitySchemes` com prefill de
 * `token`). Nunca hardcoded — uma API nova aparece aqui sozinha.
 */
export function getTokenStorageTargets() {
  const provider = getAuthProvider();
  const targets = [];

  if (provider.securitySchemes) {
    for (const scheme of provider.securitySchemes) {
      if (scheme.prefill && 'token' in scheme.prefill) {
        targets.push({ slug: provider.slug, schemeName: scheme.name });
      }
    }
  }

  for (const api of apis) {
    if (api.isAuthProvider) continue;
    if (api.securityScheme) {
      targets.push({ slug: api.slug, schemeName: api.securityScheme });
    } else if (api.securitySchemes) {
      for (const scheme of api.securitySchemes) {
        if (scheme.prefill && 'token' in scheme.prefill) {
          targets.push({ slug: api.slug, schemeName: scheme.name });
        }
      }
    }
  }

  return targets;
}

/** Grava o token em TODOS os alvos descobertos a partir do manifesto.
 *  Nunca lança — cada gravação é isolada; uma falhar não impede as demais. */
export function syncTokenToStorage(storage, token) {
  if (!storage || !token) return;
  for (const { slug, schemeName } of getTokenStorageTargets()) {
    try {
      writeTokenToScheme(storage, slug, schemeName, token);
    } catch {
      // Complemento, não crítico — nunca deixa isso quebrar o app.
    }
  }
}

/**
 * Documentos do manifesto com mais de 1 security scheme — hoje só a
 * Auth ("Gerar JWT" + "Atualizar JWT"). Genérico: uma API futura com
 * `securitySchemes` de mais de um item também seria coberta sozinha.
 */
export function getMultiSchemeDocuments() {
  return apis
    .filter((api) => Array.isArray(api.securitySchemes) && api.securitySchemes.length > 1)
    .map((api) => ({ slug: api.slug, schemeNames: api.securitySchemes.map((s) => s.name) }));
}

/** true se `selectedSchemes` já contém TODOS os nomes esperados, um
 *  requirement por nome (o formato `[{"A":[]},{"B":[]}]`, não
 *  `[{"A":[],"B":[]}]` combinado). */
function hasAllSchemesSelected(selectedSchemes, schemeNames) {
  if (!Array.isArray(selectedSchemes)) return false;
  return schemeNames.every((name) => selectedSchemes.some((requirement) => requirement && name in requirement));
}

/**
 * Garante que `selected.document` do slug indicado tenha TODOS os
 * schemes de `schemeNames`, um requirement por nome (relação "OU": o
 * usuário alterna manualmente entre eles). Não faz nada se já estiver
 * correto (evita escrita desnecessária). Nunca mexe em `secrets`.
 */
export function ensureDocumentSelectedSchemes(storage, slug, schemeNames) {
  const entry = readAuthEntry(storage, slug);
  const existing = entry.selected.document;

  if (existing && hasAllSchemesSelected(existing.selectedSchemes, schemeNames)) {
    return; // já está certo — não reescreve à toa
  }

  const updated = {
    ...entry,
    selected: {
      ...entry.selected,
      document: {
        selectedIndex: 0,
        selectedSchemes: schemeNames.map((name) => ({ [name]: [] })),
      },
    },
  };

  storage.setItem(authStorageKey(slug), JSON.stringify(updated));
}

/**
 * Roda `ensureDocumentSelectedSchemes` para todo documento
 * multi-scheme do manifesto. Chamada uma vez, na inicialização do app
 * (`src/main.js`) — cobre exatamente o "mesmo se excluídos se
 * regenerassem ao atualizar [a página]" pedido: se a chave for apagada
 * (ou nunca ter existido, ou ficar com só um scheme por qualquer
 * motivo), a próxima carga da página já regenera com os dois.
 */
export function ensureAllMultiSchemeSelections(storage) {
  if (!storage) return;
  for (const { slug, schemeNames } of getMultiSchemeDocuments()) {
    try {
      ensureDocumentSelectedSchemes(storage, slug, schemeNames);
    } catch {
      // Nunca deixa isso impedir o app de montar.
    }
  }
}

/**
 * Pega um valor JÁ SERIALIZADO (uma string JSON, ou null/undefined) e
 * devolve uma nova string com o token reaplicado nos schemes indicados
 * — preservando o resto do conteúdo. Função pura, sem tocar em
 * storage — usada tanto pela escrita direta quanto pelo guard abaixo,
 * para o guard não precisar chamar `storage.setItem` de novo (o que
 * reentraria nele mesmo).
 */
export function mergeTokenIntoSerializedEntry(rawValue, schemeNames, token) {
  let entry;
  try {
    const parsed = rawValue ? JSON.parse(rawValue) : null;
    entry = {
      secrets: parsed && typeof parsed.secrets === 'object' ? parsed.secrets : {},
      selected: parsed && typeof parsed.selected === 'object' ? parsed.selected : {},
    };
  } catch {
    entry = { secrets: {}, selected: {} };
  }

  const secrets = { ...entry.secrets };
  for (const schemeName of schemeNames) {
    const existingScheme = secrets[schemeName] || { type: 'http' };
    secrets[schemeName] = { ...existingScheme, 'x-scalar-secret-token': token };
  }

  return JSON.stringify({ ...entry, secrets });
}

/**
 * Rastreia quais objetos `storage` já têm o guard instalado — em
 * memória, via WeakSet (nunca persiste, nunca aparece como uma entrada
 * de storage). Não usa `storage.__algumaFlag = true` de propósito: o
 * `localStorage` do navegador é um "objeto especial" da plataforma
 * (legacy platform object) onde QUALQUER atribuição de propriedade
 * arbitrária vira uma entrada real de storage — `storage.foo = 'bar'`
 * na prática funciona como `storage.setItem('foo', 'bar')`. Uma versão
 * anterior fazia exatamente isso (`storage.__tokenBridgeGuardInstalled = true`)
 * — funcionava no Storage falso dos testes (um objeto comum, sem esse
 * comportamento), mas no navegador de verdade criava uma entrada
 * visível E, pior, sobrevivia a recarregar a página — fazendo o guard
 * achar que já estava instalado numa sessão totalmente nova, onde o
 * `setItem` "guardado" da carga anterior não existe mais.
 */
const guardedStorages = new WeakSet();

/**
 * "Guarda" o `storage.setItem` para as chaves de auth relevantes.
 *
 * Por quê: o Scalar tem seu próprio ciclo de escrita nessa MESMA chave
 * — `setAuth()`, debounced (~500ms), disparado sempre que o estado de
 * auth muda em memória (ex.: a pessoa digitou usuário/senha em "Gerar
 * JWT"). Essa escrita reflete só o que o Scalar sabe — nunca o token
 * que gravamos por fora — e se ela acontecer DEPOIS da nossa (uma
 * corrida de tempo perfeitamente plausível: nosso `syncTokenToStorage`
 * roda assim que a resposta do login chega, e o debounce do Scalar
 * pode disparar alguns instantes depois), ela apaga o que escrevemos,
 * mesmo tendo funcionado por um instante.
 *
 * A correção não tenta acertar o timing — intercepta a própria escrita
 * (mesma ideia do `customFetch`, aplicada ao `setItem`): depois de
 * QUALQUER gravação nas chaves relevantes, reaplica o token por cima,
 * na hora, antes de devolver o controle. Não importa quando o Scalar
 * decide gravar — nosso reforço sempre vem por último.
 *
 * Retorna uma função pra desinstalar (útil em testes).
 */
export function installTokenStorageGuard(storage, state) {
  if (!storage || typeof storage.setItem !== 'function' || guardedStorages.has(storage)) {
    return () => {};
  }

  // Limpeza de uma versão anterior deste guard, que por engano escrevia
  // `storage.__tokenBridgeGuardInstalled = true` — em navegadores de
  // verdade, isso vira uma entrada real de storage (ver comentário
  // acima). Sem função nenhuma a partir desta versão; remove se sobrou
  // de um carregamento anterior da página.
  try {
    if (typeof storage.removeItem === 'function') {
      storage.removeItem('__tokenBridgeGuardInstalled');
    }
  } catch {
    // Não crítico — só uma limpeza de cortesia.
  }

  const originalSetItem = storage.setItem.bind(storage);
  const targetsByKey = new Map();
  for (const { slug, schemeName } of getTokenStorageTargets()) {
    const key = authStorageKey(slug);
    if (!targetsByKey.has(key)) targetsByKey.set(key, []);
    targetsByKey.get(key).push(schemeName);
  }

  function guardedSetItem(key, value) {
    if (state.token && targetsByKey.has(key)) {
      originalSetItem(key, mergeTokenIntoSerializedEntry(value, targetsByKey.get(key), state.token));
      return;
    }
    originalSetItem(key, value);
  }

  storage.setItem = guardedSetItem;
  guardedStorages.add(storage);

  return function uninstall() {
    storage.setItem = originalSetItem;
    guardedStorages.delete(storage);
  };
}
