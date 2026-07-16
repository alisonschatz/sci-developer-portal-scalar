import { apis, SHARED_TOKEN_VARIABLE } from '../../apis.manifest.js';

/**
 * Constrói o array `sources[]` do Scalar a partir do manifesto único de
 * APIs. Esta função é o ÚNICO lugar do projeto que sabe como conectar uma
 * API consumidora ao token gerado pela API `auth` — e ela faz isso de
 * forma automática para qualquer API nova que apareça no manifesto:
 *
 *   - Caso simples (`api.securityScheme`, string): o token/valor daquele
 *     scheme é pré-preenchido com `{{sci_auth_token}}`. Cobre a maioria
 *     das APIs futuras, que devem ter só um scheme relevante.
 *   - Caso rico (`api.securitySchemes`, array — hoje só a própria
 *     `auth`): cada scheme pode ter seu próprio `prefill` (ou nenhum) e
 *     ser marcado `preferred` independentemente — necessário quando uma
 *     API tem mais de um scheme com comportamentos diferentes (ex.: a
 *     Auth tem "Gerar JWT", Basic, sem prefill — são as credenciais que
 *     GERAM o token — e "Atualizar JWT", Bearer, prefill com o próprio
 *     token compartilhado, porque renovar exige apresentá-lo).
 *   - `api.securityScheme: null` (sem `securitySchemes`): nenhuma
 *     authentication é pré-configurada.
 *
 * Como o login grava o token em `pm.globals` (workspace-wide, não por
 * documento), o valor já chega resolvido aqui sem nenhum código extra
 * por API. Ver README, seção "Como o token é compartilhado entre as APIs".
 */
export function buildScalarSources(basePath = '/') {
  return apis.map((api) => {
    const source = {
      title: api.title,
      slug: api.slug,
      url: `${basePath}openapi/${api.id}.json`,
      default: Boolean(api.default),
    };

    if (api.securityScheme) {
      source.authentication = {
        preferredSecurityScheme: api.securityScheme,
        securitySchemes: {
          [api.securityScheme]: {
            // HTTP Bearer usa `token`; API Key usa `value`. Cobrimos os dois
            // formatos com o mesmo template — o Scalar ignora o que não se
            // aplica ao tipo real do security scheme desta API.
            token: `{{${SHARED_TOKEN_VARIABLE}}}`,
            value: `{{${SHARED_TOKEN_VARIABLE}}}`,
          },
        },
      };
    } else if (api.securitySchemes) {
      const preferred = api.securitySchemes.filter((s) => s.preferred).map((s) => s.name);
      const securitySchemes = {};
      for (const scheme of api.securitySchemes) {
        if (scheme.prefill) securitySchemes[scheme.name] = scheme.prefill;
      }

      source.authentication = {
        // string se só 1 preferido, array (relação "OU") se mais de 1 —
        // confirmado em node_modules/@scalar/types (authentication-configuration.d.ts).
        preferredSecurityScheme: preferred.length > 1 ? preferred : (preferred[0] ?? null),
        ...(Object.keys(securitySchemes).length > 0 ? { securitySchemes } : {}),
      };
    }

    return source;
  });
}

/**
 * Configuration global do Scalar. A base foi adotada de uma configuration
 * que o usuário testou localmente e gostou — todo campo abaixo foi
 * conferido contra o schema Zod real de node_modules/@scalar/types
 * (versão instalada, 1.62.7) antes de entrar aqui, então os nomes/valores
 * batem exatamente com o que esta versão do Scalar espera.
 *
 * Quatro campos da configuration original NÃO entraram aqui de propósito:
 * `title`, `slug`, `default` e `authentication`. Eles existem no schema
 * (inclusive no nível global, como fallback), mas os valores que vieram
 * ("RH Net Social", "rhnetsocial", bearerAuth com o token) eram os
 * valores RESOLVIDOS para o documento que estava aberto no momento —
 * não configuration global. Esses 4 campos já são derivados
 * corretamente PARA CADA API pelo `buildScalarSources()` acima, a partir
 * do manifesto — copiá-los pra cá fixaria toda API (inclusive a Auth)
 * com o título/slug/auth de uma única API específica.
 */
export function buildScalarConfiguration(basePath = '/') {
  return {
    sources: buildScalarSources(basePath),

    // ── Layout & aparência ────────────────────────────────────────────
    layout: 'modern',
    // Preset de tema do Scalar (paleta baseada na identidade visual da
    // Fastify). O accent continua sendo o navy da SCI por cima disso —
    // ver o comentário no bloco `:root` de src/style.css para o motivo
    // (CSS Cascade Layers) de isso ser garantido, não coincidência.
    theme: 'fastify',
    withDefaultFonts: true,
    hideDarkModeToggle: false,

    // ── Sidebar & navegação ──────────────────────────────────────────
    showSidebar: true,
    hideSearch: false,
    defaultOpenFirstTag: false,
    defaultOpenAllTags: false,
    operationTitleSource: 'summary',
    showOperationId: false,

    // ── Modelos/Schemas ──────────────────────────────────────────────
    // Mantido `true` (decisão já existente neste projeto, não fazia
    // parte da configuration adotada) — os schemas de request/response
    // já aparecem inline em cada operação; a seção separada de Models
    // duplicava a mesma informação sem adicionar contexto para quem
    // está integrando pontualmente com uma API específica.
    hideModels: true,
    modelsSectionLabel: 'Models',
    expandAllModelSections: false,
    orderSchemaPropertiesBy: 'alpha',
    orderRequiredPropertiesFirst: true,

    // ── Cliente de teste (Test Request) ─────────────────────────────
    hideClientButton: true,
    hideTestRequestButton: false,
    isEditable: false,
    expandAllResponses: false,
    expandAllSchemaProperties: false,
    documentDownloadType: 'both',

    // Mantém a sessão de autenticação entre recarregamentos — recurso
    // oficial do Scalar (configuration.persistAuth).
    persistAuth: true,

    // ── Ferramentas de desenvolvedor ─────────────────────────────────
    // 'localhost': só aparecem rodando local (npm run dev/preview) — em
    // produção (GitHub Pages) ficam ocultas automaticamente, sem precisar
    // de nenhuma lógica extra de ambiente aqui.
    showDeveloperTools: 'localhost',
    showToolbar: 'localhost',

    // ── Telemetria e serviços externos do Scalar ─────────────────────
    // `telemetry: true` envia dados de uso anônimos para os servidores
    // da Scalar (não dados de negócio/LGPD — é sobre o uso do próprio
    // visualizador de docs). `externalUrls` são os endereços padrão dos
    // serviços hospedados pela Scalar (dashboard, registry, proxy de
    // CORS, API). Mantido explícito aqui porque foi a configuration que
    // o time validou — se decidirem desativar telemetria depois, é só
    // trocar para `false` aqui, um lugar só.
    telemetry: true,
    externalUrls: {
      dashboardUrl: 'https://dashboard.scalar.com',
      registryUrl: 'https://registry.scalar.com',
      proxyUrl: 'https://proxy.scalar.com',
      apiBaseUrl: 'https://api.scalar.com',
    },

    metaData: {
      title: 'Portal do Desenvolvedor — SCI',
      description: 'Documentação oficial das APIs da SCI para parceiros e clientes.',
    },
  };
}
