import fs from 'fs';
import path from 'path';
import { apis, validateManifest } from '../apis.manifest.js';

const ROOT = process.cwd();
const OUTPUT_PATH = path.resolve(ROOT, '.env.example');

function main() {
  const errors = validateManifest();
  if (errors.length > 0) {
    console.error('[print-env-example] apis.manifest.js está inválido — rode `npm run manifest:verify` para detalhes.');
    process.exit(1);
  }

  const lines = [
    '# ============================================================================',
    '# ARQUIVO GERADO por scripts/print-env-example.js a partir de apis.manifest.js.',
    '# Rode `npm run env:example` de novo depois de adicionar uma API ao manifesto.',
    '#',
    '# Copie para .env e preencha com os valores reais (nunca commite o .env real).',
    '# Em CI/CD, os mesmos nomes viram GitHub Secrets — ver README, seção "Publicação".',
    '# ============================================================================',
    '',
  ];

  for (const api of apis) {
    lines.push(`# --- ${api.title} (${api.id}) ${api.isAuthProvider ? '— gera o token compartilhado' : ''} `.trimEnd());
    lines.push(`${api.sourceUrlEnv}=`);
    if (api.sourceTokenEnv) {
      lines.push(`# Só necessário se o endpoint de docs desta API exigir autenticação para ser baixado.`);
      lines.push(`${api.sourceTokenEnv}=`);
    }
    lines.push('');
  }

  fs.writeFileSync(OUTPUT_PATH, lines.join('\n'), 'utf8');
  console.log(`[print-env-example] ${OUTPUT_PATH} gerado a partir de ${apis.length} API(s) do manifesto.`);
}

main();
