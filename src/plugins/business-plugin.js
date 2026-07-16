import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';

const ROOT = process.cwd();

/**
 * Extrai { method, routePath } a partir do JSON Pointer que o Redocly
 * fornece em ctx.location.pointer para o node de uma Operation, ex:
 *   "#/paths/~1api~1v1~1auth~1login/post"
 * Isso dá uma chave ESTÁVEL (método + caminho), ao contrário do
 * operationId, que em specs gerados automaticamente (Laravel/swagger-php,
 * e potencialmente outros stacks das próximas APIs da SCI) costuma vir como
 * hash e pode mudar a cada nova geração do Swagger.
 */
export function operationKeyFromPointer(pointer) {
  const match = /^#\/paths\/(.+)\/(get|post|put|patch|delete|options|head|trace)$/i.exec(pointer || '');
  if (!match) return null;

  const rawPath = match[1];
  const method = match[2].toUpperCase();
  const routePath = rawPath.replace(/~1/g, '/').replace(/~0/g, '~');
  return `${method} ${routePath}`;
}

function loadYamlFile(filePath) {
  if (!fs.existsSync(filePath)) return {};
  return yaml.load(fs.readFileSync(filePath, 'utf8')) || {};
}

function loadJsonFile(filePath) {
  if (!fs.existsSync(filePath)) return {};
  return JSON.parse(fs.readFileSync(filePath, 'utf8') || '{}');
}

/**
 * Decorator: injeta summary/description de negócio por operação.
 * Aceita { source: '<id da API no manifesto>' }, lendo
 * src/decorators/<source>/descriptions.yaml (chaveado por "MÉTODO /caminho").
 *
 * Também injeta `x-post-response` quando a entrada tiver um campo
 * `postResponseScript` — usado no login da API `auth` para capturar o
 * token da resposta e salvar como variável global do Scalar (pm.globals,
 * compartilhada entre TODOS os documentos abertos no portal — ver
 * README.md, seção "Como o token é compartilhado entre as APIs").
 */
/** @type {import('@redocly/cli').OasDecorator} */
function InjectDescriptions({ source }) {
  const descriptionsPath = path.resolve(ROOT, `src/decorators/${source}/descriptions.yaml`);
  const descriptions = loadYamlFile(descriptionsPath);

  return {
    Operation: {
      leave(operation, ctx) {
        const key = operationKeyFromPointer(ctx?.location?.pointer);
        const entry = (key && descriptions[key]) || (operation.operationId && descriptions[operation.operationId]);
        if (!entry) return;

        if (entry.summary) operation.summary = entry.summary;
        if (entry.description) operation.description = entry.description;
        if (entry.postResponseScript) operation['x-post-response'] = entry.postResponseScript;
      },
    },
  };
}

/**
 * Decorator: injeta exemplos SINTÉTICOS de request/response.
 * Mesmo esquema de chave que o InjectDescriptions.
 *
 * ⚠️ Nunca colar dados reais aqui, mesmo "anonimizados" — sempre dados
 * fictícios. Isso é ainda mais crítico em APIs de RH: payloads de admissão
 * trafegam CPF, dados bancários e endereço — dados pessoais sensíveis
 * pela LGPD.
 */
/** @type {import('@redocly/cli').OasDecorator} */
function InjectExamples({ source }) {
  const examplesPath = path.resolve(ROOT, `src/decorators/${source}/examples.json`);
  const examples = loadJsonFile(examplesPath);

  return {
    Operation: {
      leave(operation, ctx) {
        const key = operationKeyFromPointer(ctx?.location?.pointer);
        const entry = (key && examples[key]) || (operation.operationId && examples[operation.operationId]);
        if (!entry) return;

        if (entry.request && operation.requestBody && operation.requestBody.content) {
          for (const mediaType of Object.values(operation.requestBody.content)) {
            mediaType.example = entry.request;
          }
        }

        if (entry.responses && operation.responses) {
          for (const [status, exampleValue] of Object.entries(entry.responses)) {
            const response = operation.responses[status];
            if (response && response.content) {
              for (const mediaType of Object.values(response.content)) {
                mediaType.example = exampleValue;
              }
            }
          }
        }
      },
    },
  };
}

/**
 * Decorator: substitui info.description (a introdução da API) a partir de
 * um markdown dedicado. Aceita { file }, caminho relativo à raiz do
 * projeto. Ver src/decorators/<id>/overview.md — sintaxe de callout
 * suportada pelo Scalar: alerts estilo GitHub (`> [!WARNING]` etc.), não
 * comentários `<!-- theme: ... -->` (essa era a sintaxe de uma ferramenta
 * anterior; foi corrigida nesta versão do portal).
 */
/** @type {import('@redocly/cli').OasDecorator} */
function SetOverview({ file }) {
  return {
    Info: {
      leave(info) {
        if (!file) return;
        const filePath = path.resolve(ROOT, file);
        if (!fs.existsSync(filePath)) return;
        info.description = fs.readFileSync(filePath, 'utf8');
      },
    },
  };
}

/**
 * Decorator: sobrescreve a descrição de cada tag (grupo de endpoints). No
 * Scalar, a descrição de tag é renderizada como conteúdo visível acima dos
 * endpoints daquele grupo — é o lugar certo para a explicação de permissão
 * por recurso, no ponto em que a pessoa já está olhando aquele recurso.
 *
 * Aceita { source }, lendo src/decorators/<source>/tags.yaml, chaveado
 * pelo nome exato da tag (`tags[].name` no spec de origem). Tag sem
 * entrada no arquivo mantém a descrição original do backend.
 */
/** @type {import('@redocly/cli').OasDecorator} */
function InjectTagDescriptions({ source }) {
  const tagsPath = path.resolve(ROOT, `src/decorators/${source}/tags.yaml`);
  const overrides = loadYamlFile(tagsPath);

  return {
    Tag: {
      leave(tag) {
        const entry = tag.name && overrides[tag.name];
        if (!entry) return;
        if (entry.description) tag.description = entry.description;
      },
    },
  };
}

/**
 * Decorator: injeta `servers` no OpenAPI final quando o spec de origem não
 * declara nenhum. Sem isso, o Scalar não consegue montar a URL completa
 * nos exemplos de requisição / cliente de testes. Aceita { url,
 * description }. Não sobrescreve se o spec já tiver servers na origem.
 */
/** @type {import('@redocly/cli').OasDecorator} */
function AddServers({ url, description }) {
  return {
    Root: {
      leave(root) {
        if (!url) return;
        if (Array.isArray(root.servers) && root.servers.length > 0) return;
        root.servers = [{ url, description: description || 'Produção' }];
      },
    },
  };
}

export default function businessPlugin() {
  return {
    id: 'business',
    decorators: {
      oas3: {
        'inject-descriptions': InjectDescriptions,
        'inject-examples': InjectExamples,
        'set-overview': SetOverview,
        'inject-tag-descriptions': InjectTagDescriptions,
        'add-servers': AddServers,
      },
    },
  };
}
