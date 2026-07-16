import fs from 'fs';
import path from 'path';
import axios from 'axios';
import 'dotenv/config';
import { pathToFileURL } from 'node:url';
import { apis, validateManifest } from '../apis.manifest.js';

const ROOT = process.cwd();

/**
 * Rede de segurança (fallback): remove por padrão de path qualquer rota
 * que ainda não tenha sido marcada com "x-internal: true" no spec de
 * origem. O filtro PRIMÁRIO e recomendado é x-internal + o decorator
 * nativo `remove-x-internal` do Redocly (ver redocly.base.yaml).
 *
 * Este filtro vale para TODAS as APIs do manifesto — é uma proteção geral
 * contra o dia em que uma rota administrativa/interna for adicionada, em
 * qualquer uma das APIs presentes ou futuras, sem o cuidado de marcar
 * x-internal na origem.
 */
export const BLACKLIST_PATTERNS = [
  /^\/api\/admin(\/|$)/,
  /^\/api\/internal(\/|$)/,
  /^\/api\/_debug(\/|$)/,
  /\/health-?check$/i,
];

export function isBlacklisted(routePath) {
  return BLACKLIST_PATTERNS.some((pattern) => pattern.test(routePath));
}

async function fetchOpenApiSpec(api) {
  const sourceUrl = process.env[api.sourceUrlEnv];
  if (!sourceUrl) {
    console.error(
      `[fetch-api] (${api.id}) Variável de ambiente ${api.sourceUrlEnv} não definida. ` +
        'Copie .env.example para .env e configure a URL de produção — ' +
        'ou rode `npm run env:example` para conferir todas as variáveis esperadas pelo manifesto atual.'
    );
    process.exit(1);
  }

  const token = api.sourceTokenEnv ? process.env[api.sourceTokenEnv] : undefined;
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;

  console.log(`[fetch-api] (${api.id}) Baixando spec de: ${sourceUrl}`);
  const { data } = await axios.get(sourceUrl, { headers, timeout: 30_000 });

  if (!data || typeof data !== 'object' || !data.paths) {
    throw new Error(`[fetch-api] (${api.id}) Resposta não parece um OpenAPI válido (sem "paths").`);
  }

  return data;
}

export function filterInternalRoutes(spec, apiId) {
  const originalCount = Object.keys(spec.paths).length;
  let removed = 0;

  for (const routePath of Object.keys(spec.paths)) {
    if (isBlacklisted(routePath)) {
      delete spec.paths[routePath];
      removed++;
    }
  }

  console.log(`[fetch-api] (${apiId}) Rotas filtradas pela blacklist: ${removed} removidas de ${originalCount}.`);
  return spec;
}

function backupPreviousVersion(outputPath) {
  const previousPath = outputPath.replace(/\.json$/, '.previous.json');
  if (fs.existsSync(outputPath)) {
    fs.copyFileSync(outputPath, previousPath);
  }
}

async function processApi(api) {
  const outputPath = path.resolve(ROOT, `src/base/openapi-${api.id}.json`);
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });

  backupPreviousVersion(outputPath);

  const rawSpec = await fetchOpenApiSpec(api);
  const cleanedSpec = filterInternalRoutes(rawSpec, api.id);

  fs.writeFileSync(outputPath, JSON.stringify(cleanedSpec, null, 2), 'utf8');
  console.log(`[fetch-api] (${api.id}) Spec salvo em ${outputPath}`);
}

async function main() {
  const errors = validateManifest();
  if (errors.length > 0) {
    console.error('[fetch-api] apis.manifest.js está inválido — rode `npm run manifest:verify` para detalhes.');
    process.exit(1);
  }

  for (const api of apis) {
    await processApi(api);
  }
}

const isMainModule = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMainModule) {
  main().catch((err) => {
    console.error('[fetch-api] Falha ao buscar/filtrar uma das APIs:', err.message);
    process.exit(1);
  });
}
