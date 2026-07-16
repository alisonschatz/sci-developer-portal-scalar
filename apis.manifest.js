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
 *                                     compartilhado. Use `null` para a própria API
 *                                     `auth` (ela não consome o token, ela o gera).
 * @property {boolean} [default]      Se true, esta API abre por padrão no portal.
 *                                     Deve haver exatamente uma com `default: true`.
 * @property {{method: string, path: string}} [loginRequest]
 *                                     Só na API isAuthProvider: método + caminho da
 *                                     operação de login, usados pelo composable
 *                                     useTokenCapture (src/composables) para saber
 *                                     qual resposta observar via `customFetch` do
 *                                     Scalar e mostrar o banner de token capturado.
 * @property {string} [tokenResponseField]
 *                                     Só na API isAuthProvider: nome do campo, no
 *                                     JSON de resposta do login, que contém o JWT.
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
    default: true,
    loginRequest: { method: 'POST', path: '/api/v1/auth/credencial/login' },
    tokenResponseField: 'token',
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
      if (!api.loginRequest || !api.loginRequest.method || !api.loginRequest.path) {
        errors.push(`API "${api.id}" é isAuthProvider mas não define loginRequest { method, path }.`);
      }
      if (!api.tokenResponseField) {
        errors.push(`API "${api.id}" é isAuthProvider mas não define tokenResponseField.`);
      }
    }
    if (api.default) defaultCount += 1;

    if (!api.isAuthProvider && !api.securityScheme) {
      errors.push(
        `API "${api.id}" não é a auth provider mas não define securityScheme — ` +
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
