import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildScalarConfiguration } from '../src/config/scalar.config.js';

/**
 * Trava os valores da configuration que o usuário testou localmente e
 * pediu para adotar (ver conversa/README) — cada chave aqui foi
 * conferida contra o schema Zod real de @scalar/types antes de entrar
 * em src/config/scalar.config.js. Este teste existe para que uma edição
 * futura desse arquivo não mude um desses valores por acidente (ex.:
 * um merge malfeito revertendo `theme` para o default).
 */
test('buildScalarConfiguration() aplica a configuration global adotada', () => {
  const config = buildScalarConfiguration();

  assert.equal(config.layout, 'modern');
  assert.equal(config.theme, 'fastify');
  assert.equal(config.withDefaultFonts, true);
  assert.equal(config.hideDarkModeToggle, false);

  assert.equal(config.showSidebar, true);
  assert.equal(config.hideSearch, false);
  assert.equal(config.defaultOpenFirstTag, false);
  assert.equal(config.defaultOpenAllTags, false);
  assert.equal(config.operationTitleSource, 'summary');
  assert.equal(config.showOperationId, false);

  assert.equal(config.hideModels, true);
  assert.equal(config.modelsSectionLabel, 'Models');
  assert.equal(config.expandAllModelSections, false);
  assert.equal(config.orderSchemaPropertiesBy, 'alpha');
  assert.equal(config.orderRequiredPropertiesFirst, true);

  assert.equal(config.hideClientButton, true);
  assert.equal(config.hideTestRequestButton, false);
  assert.equal(config.isEditable, false);
  assert.equal(config.expandAllResponses, false);
  assert.equal(config.expandAllSchemaProperties, false);
  assert.equal(config.documentDownloadType, 'both');
  assert.equal(config.persistAuth, true);

  assert.equal(config.showDeveloperTools, 'localhost');
  assert.equal(config.showToolbar, 'localhost');

  assert.equal(config.telemetry, true);
  assert.deepEqual(config.externalUrls, {
    dashboardUrl: 'https://dashboard.scalar.com',
    registryUrl: 'https://registry.scalar.com',
    proxyUrl: 'https://proxy.scalar.com',
    apiBaseUrl: 'https://api.scalar.com',
  });
});

test('os 4 campos por-documento (title/slug/default/authentication) NÃO vazam para o nível global', () => {
  const config = buildScalarConfiguration();

  // Esses 4 só devem existir DENTRO de cada entrada de sources[], nunca
  // soltos no topo — ver o comentário em buildScalarConfiguration() para
  // o porquê (eram valores resolvidos de UM documento específico, não
  // configuration global).
  assert.equal('title' in config, false);
  assert.equal('slug' in config, false);
  assert.equal('default' in config, false);
  assert.equal('authentication' in config, false);
});

test('sources[] continua com title/slug/default corretos por API', () => {
  const config = buildScalarConfiguration();

  const auth = config.sources.find((s) => s.slug === 'auth');
  const rh = config.sources.find((s) => s.slug === 'rhnetsocial');

  assert.equal(auth.title, 'Autenticação');
  assert.equal(auth.default, true);

  assert.equal(rh.title, 'RH Net Social');
  assert.equal(rh.default, false);
  assert.equal(rh.authentication.preferredSecurityScheme, 'bearerAuth');
});

test('auth (securitySchemes plural): os dois schemes reais vêm preferidos, só "Atualizar JWT" recebe o token compartilhado', () => {
  const config = buildScalarConfiguration();
  const auth = config.sources.find((s) => s.slug === 'auth');

  // "Gerar JWT" (Basic — credenciais de parceiro/cliente) e "Atualizar
  // JWT" (Bearer — usado no refresh) precisam vir os dois disponíveis
  // sem precisar selecionar na mão — preferredSecurityScheme como array
  // é uma relação "OU", confirmada no schema real do Scalar.
  assert.deepEqual(auth.authentication.preferredSecurityScheme, ['Gerar JWT', 'Atualizar JWT']);

  // "Gerar JWT" é quem GERA o token — não existe variável compartilhada
  // pra pré-preencher as credenciais de parceiro/cliente, então não deve
  // ter entrada em securitySchemes.
  assert.equal('Gerar JWT' in auth.authentication.securitySchemes, false);

  // "Atualizar JWT" precisa apresentar o token atual para renovar —
  // pré-preenchido com a mesma variável compartilhada.
  assert.equal(auth.authentication.securitySchemes['Atualizar JWT'].token, '{{sci_auth_token}}');
});
