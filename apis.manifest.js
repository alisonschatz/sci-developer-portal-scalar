/**
 * apis.manifest.js
 * ============================================================================
 * FONTE ÚNICA DA VERDADE de todas as APIs publicadas neste portal.
 *
 * Todo o resto do projeto DERIVA deste arquivo — nada mais deveria precisar
 * ser editado manualmente para adicionar uma API nova:
 *
 *   - scripts/fetch-api.js          → baixa o spec de cada `sourceUrlEnv`
 *   - scripts/generate-redocly-config.js → escreve redocly.generated.yaml
 *   - scripts/build-openapi.js      → roda lint + bundle para cada API
 *   - src/config/scalar.config.js   → monta o array `sources[]` do Scalar,
 *                                      já com o token compartilhado plugado
 *   - .env.example                  → gerado por scripts/print-env-example.js
 *
 * Para adicionar uma API nova, rode:
 *
 *   npm run api:new -- <id> "<Título>" <slugDoSecuritySchemeQueUsaOToken>
 *
 * Isso cria a entrada aqui (comentada, para você revisar antes de ativar) e
 * a pasta de decorators correspondente em src/decorators/<id>/.
 * Veja docs/adicionando-uma-nova-api.md para o passo a passo completo.
 * ============================================================================
 */

/**
 * @typedef {Object} ApiDefinition
 * @property {string} id              Identificador estável (kebab-case). Usado como
 *                                     nome de pasta em src/decorators/<id>/, como slug
 *                                     padrão no Scalar e como chave em todos os scripts.
 * @property {string} title           Nome exibido no seletor de documentos do Scalar.
 * @property {string} slug            Slug usado na URL (hash) do Scalar para esta API.
 *                                     Também é o valor usado em window.location.hash.
 * @property {boolean} isAuthProvider Se true, esta é a API que GERA o token
 *                                     (hoje só a `auth`). O decorator de negócio
 *                                     injeta `x-post-response` nas operações desta
 *                                     API conforme descriptions.yaml; as DEMAIS
 *                                     APIs apenas *consomem* o token via
 *                                     `{{sci_auth_token}}` — ver README, seção
 *                                     "Como o token é compartilhado".
 * @property {string} sourceUrlEnv    Nome da env var com a URL de produção do spec
 *                                     bruto (definida em .env local ou GitHub Secret).
 * @property {string} [sourceTokenEnv] Nome da env var com um token de acesso ao
 *                                     PRÓPRIO endpoint de docs, se ele exigir auth
 *                                     para ser baixado (raro; hoje nenhuma API exige).
 * @property {string} serverUrl       URL base de produção, injetada via decorator
 *                                     `add-servers` quando o spec de origem não
 *                                     declarar `servers` (comum em specs gerados
 *                                     automaticamente pelo backend).
 * @property {string|null} securityScheme
 *                                     Nome exato do security scheme (em
 *                                     components.securitySchemes no spec de origem)
 *                                     que deve ser pré-preenchido com o token
 *                                     compartilhado. Caso simples — a maioria das
 *                                     APIs futuras deve ter só UM scheme relevante
 *                                     (ex.: um Bearer só). Use `null` quando a API
 *                                     não consome o token compartilhado (hoje, só a
 *                                     própria `auth` — que usa `securitySchemes`,
 *                                     abaixo, por ter mais de um scheme).
 * @property {Array<{name: string, preferred?: boolean, prefill?: object}>} [securitySchemes]
 *                                     Caso rico, para APIs com MAIS de um security
 *                                     scheme relevante (hoje, só `auth`: "Gerar JWT"
 *                                     é Basic — não tem o que pré-preencher, são as
 *                                     credenciais que GERAM o token; "Atualizar JWT"
 *                                     é Bearer — pré-preenchido com o token
 *                                     compartilhado, porque renovar exige apresentar
 *                                     o token atual). `name` precisa bater EXATAMENTE
 *                                     com a chave em components.securitySchemes do
 *                                     spec de origem. `preferred: true` inclui esse
 *                                     scheme em `preferredSecurityScheme` (aceita
 *                                     vários — foram confirmados na Scalar como uma
 *                                     relação "OU": os schemes marcados aparecem
 *                                     disponíveis para alternar, sem precisar
 *                                     selecionar na mão). `prefill` é passado direto
 *                                     para `authentication.securitySchemes[name]` do
 *                                     Scalar — o formato depende do tipo do scheme
 *                                     (`{ token }` para Bearer, `{ username,
 *                                     password }` para Basic, `{ value }` para API
 *                                     Key). Use OU `securityScheme` OU
 *                                     `securitySchemes`, nunca os dois na mesma API.
 * @property {boolean} [default]      Se true, esta API abre por padrão no portal.
 *                                     Deve haver exatamente uma com `default: true`.
 */

/** Nome da variável global do Scalar que carrega o JWT entre documentos.
 *  Definido em UM lugar só — é referenciado por scalar.config.js e pelos
 *  decorators de descriptions.yaml da API `auth` (x-post-response). */
export const SHARED_TOKEN_VARIABLE = 'sci_auth_token';

/** @type {ApiDefinition[]} */
export const apis = [
  {
    id: 'auth',
    title: 'Autenticação',
    slug: 'auth',
    isAuthProvider: true,
    sourceUrlEnv: 'AUTH_SOURCE_URL',
    sourceTokenEnv: 'AUTH_AUTH_TOKEN',
    serverUrl: 'https://api-auth.sci.com.br',
    securityScheme: null,
    // Nomes conferidos direto no spec real da API Auth (auth.json).
    securitySchemes: [
      {
        name: 'Gerar JWT', // HTTP Basic — username/password = token de parceiro/cliente
        preferred: true, // já vem selecionado no painel de auth, sem precisar escolher
        // Sem `prefill`: username/password são as credenciais que GERAM o
        // token — não existe variável compartilhada para preencher aqui.
      },
      {
        name: 'Atualizar JWT', // HTTP Bearer — usado pelo endpoint de refresh
        preferred: true,
        prefill: { token: `{{${SHARED_TOKEN_VARIABLE}}}` }, // mesmo token que "Gerar JWT" acabou de gerar
      },
    ],
    default: true,
  },
  {
    id: 'rhnetsocial',
    title: 'RH Net Social',
    slug: 'rhnetsocial',
    isAuthProvider: false,
    sourceUrlEnv: 'RHNETSOCIAL_SOURCE_URL',
    sourceTokenEnv: 'RHNETSOCIAL_AUTH_TOKEN',
    serverUrl: 'https://api2.rhnetsocial.com.br',
    securityScheme: 'bearerAuth',
    default: false,
  },

  // ── Próxima API da SCI entra aqui embaixo ──────────────────────────────
  // {
  //   id: 'folha-pagamento',
  //   title: 'Folha de Pagamento',
  //   slug: 'folha-pagamento',
  //   isAuthProvider: false,
  //   sourceUrlEnv: 'FOLHA_PAGAMENTO_SOURCE_URL',
  //   sourceTokenEnv: 'FOLHA_PAGAMENTO_AUTH_TOKEN',
  //   serverUrl: 'https://api-folha.sci.com.br',
  //   securityScheme: 'bearerAuth',
  //   default: false,
  // },
];

/** A API que gera o token (deve haver exatamente uma). */
export function getAuthProvider() {
  const provider = apis.find((api) => api.isAuthProvider);
  if (!provider) {
    throw new Error(
      '[apis.manifest] Nenhuma API marcada com isAuthProvider: true. ' +
        'O portal precisa de exatamente uma API responsável por gerar o token compartilhado.'
    );
  }
  return provider;
}

/** Validações estruturais do manifesto — chamada por scripts/verify-manifest.js
 *  e por todo script que consome o manifesto, para falhar cedo e com uma
 *  mensagem clara em vez de um erro obscuro no meio do pipeline.
 *
 *  Aceita uma lista opcional (em vez de sempre usar `apis`) para poder ser
 *  testada isoladamente com cenários inválidos — ver test/manifest.test.js. */
export function validateManifest(list = apis) {
  const errors = [];

  if (list.length === 0) {
    errors.push('O manifesto está vazio — nenhuma API configurada.');
  }

  const ids = new Set();
  const slugs = new Set();
  let defaultCount = 0;
  let authProviderCount = 0;

  for (const api of list) {
    if (!/^[a-z][a-z0-9-]*$/.test(api.id || '')) {
      errors.push(`API com id inválido: "${api.id}" (use kebab-case, começando com letra).`);
    }
    if (ids.has(api.id)) errors.push(`id duplicado no manifesto: "${api.id}".`);
    ids.add(api.id);

    if (slugs.has(api.slug)) errors.push(`slug duplicado no manifesto: "${api.slug}" (API "${api.id}").`);
    slugs.add(api.slug);

    if (!api.sourceUrlEnv) errors.push(`API "${api.id}" não define sourceUrlEnv.`);
    if (!api.serverUrl) errors.push(`API "${api.id}" não define serverUrl.`);

    if (api.isAuthProvider) {
      authProviderCount += 1;
    }
    if (api.default) defaultCount += 1;

    if (api.securityScheme && api.securitySchemes) {
      errors.push(
        `API "${api.id}" define securityScheme E securitySchemes — use só um dos dois (securitySchemes para múltiplos schemes, securityScheme para o caso simples de um só).`
      );
    }

    if (api.securitySchemes) {
      if (!Array.isArray(api.securitySchemes) || api.securitySchemes.length === 0) {
        errors.push(`API "${api.id}" define securitySchemes, mas não é um array não-vazio.`);
      } else {
        for (const scheme of api.securitySchemes) {
          if (!scheme.name) errors.push(`API "${api.id}" tem uma entrada em securitySchemes sem "name".`);
        }
      }
    }

    if (!api.isAuthProvider && !api.securityScheme && !api.securitySchemes) {
      errors.push(
        `API "${api.id}" não é a auth provider mas não define securityScheme nem securitySchemes — ` +
          'ela não vai receber o token compartilhado automaticamente. Se isso for ' +
          'intencional (API pública, sem auth), defina securityScheme: null explicitamente.'
      );
    }
  }

  if (authProviderCount !== 1) {
    errors.push(
      `Deve haver exatamente 1 API com isAuthProvider: true (encontradas: ${authProviderCount}).`
    );
  }
  if (defaultCount !== 1) {
    errors.push(`Deve haver exatamente 1 API com default: true (encontradas: ${defaultCount}).`);
  }

  return errors;
}
