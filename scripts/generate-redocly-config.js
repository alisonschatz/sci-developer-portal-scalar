import fs from 'fs';
import path from 'path';
import { apis, validateManifest } from '../apis.manifest.js';

const ROOT = process.cwd();
const OUTPUT_PATH = path.resolve(ROOT, 'redocly.generated.yaml');
const HEADER_PATH = path.resolve(ROOT, 'redocly.base.yaml');

/**
 * redocly.yaml não tem como "importar lógica" — é YAML estático. Para que o
 * manifesto continue sendo a única fonte da verdade mesmo assim, este script
 * GERA o bloco `apis:` (uma API = um bloco `root` + decorators) a partir de
 * apis.manifest.js, e concatena com o restante da config (plugins, regras de
 * lint) que mora em redocly.base.yaml — esse sim editável à mão, porque não
 * depende de quais APIs existem.
 *
 * Rodado automaticamente por `npm run api:lint` / `npm run api:bundle`
 * (ver package.json). Não precisa rodar isso manualmente no dia a dia.
 */
function main() {
  const errors = validateManifest();
  if (errors.length > 0) {
    console.error('[generate-redocly-config] Manifesto inválido — rode `npm run manifest:verify` para detalhes.');
    process.exit(1);
  }

  if (!fs.existsSync(HEADER_PATH)) {
    console.error(`[generate-redocly-config] Não encontrei ${HEADER_PATH}.`);
    process.exit(1);
  }

  const base = fs.readFileSync(HEADER_PATH, 'utf8').trimEnd();

  const apisBlock = apis
    .map((api) => {
      const lines = [
        `  ${api.id}:`,
        `    root: src/base/openapi-${api.id}.json`,
        `    decorators:`,
        `      remove-x-internal: on`,
        `      business/add-servers:`,
        `        url: ${api.serverUrl}`,
        `      business/set-overview:`,
        `        file: src/decorators/${api.id}/overview.md`,
        `      business/inject-tag-descriptions:`,
        `        source: ${api.id}`,
        `      business/inject-descriptions:`,
        `        source: ${api.id}`,
        `      business/inject-examples:`,
        `        source: ${api.id}`,
      ];
      return lines.join('\n');
    })
    .join('\n\n');

  const generatedNotice = [
    '# ============================================================================',
    '# ARQUIVO GERADO — NÃO EDITE À MÃO.',
    '#',
    '# Gerado por scripts/generate-redocly-config.js a partir de:',
    '#   - apis.manifest.js   (quais APIs existem, id, título, server URL)',
    '#   - redocly.base.yaml  (plugins e regras de lint, comuns a todas as APIs)',
    '#',
    '# Para adicionar/remover uma API, edite apis.manifest.js e rode',
    '# `npm run api:lint` ou `npm run api:bundle` novamente — este arquivo é',
    '# regenerado automaticamente antes de cada um desses comandos.',
    '# ============================================================================',
    '',
  ].join('\n');

  const output = `${generatedNotice}${base}\n\napis:\n${apisBlock}\n`;

  fs.writeFileSync(OUTPUT_PATH, output, 'utf8');
  console.log(`[generate-redocly-config] ${OUTPUT_PATH} gerado com ${apis.length} API(s).`);
}

main();
