import fs from 'fs';
import path from 'path';
import { apis, validateManifest } from '../apis.manifest.js';

const ROOT = process.cwd();
const OPENAPI_DIR = path.resolve(ROOT, 'public/openapi');
const REQUIRED_STATIC_ASSETS = ['assets/sci-logo.png'];

function main() {
  const manifestErrors = validateManifest();
  if (manifestErrors.length > 0) {
    console.error('❌ apis.manifest.js está inválido — rode `npm run manifest:verify` para detalhes.');
    process.exit(1);
  }

  const missingBundles = apis
    .map((api) => `openapi/${api.id}.json`)
    .filter((rel) => !fs.existsSync(path.join(ROOT, 'public', rel)));

  const missingAssets = REQUIRED_STATIC_ASSETS.filter((rel) => !fs.existsSync(path.join(ROOT, 'public', rel)));

  if (missingBundles.length > 0) {
    console.error('\n❌ Faltam bundles de OpenAPI em public/openapi/:');
    missingBundles.forEach((f) => console.error(`   - public/${f}`));
    console.error('\n   Isso normalmente acontece quando `npm run dev` ou `npm run preview` é rodado');
    console.error('   sem passar por `npm run build:openapi` antes (fetch + lint + bundle das APIs).');
    console.error('\n   Rode:  npm run build:openapi');
    console.error('   E depois: npm run dev (ou npm run preview, após npm run build)\n');
    process.exit(1);
  }

  if (missingAssets.length > 0) {
    console.error('\n❌ Faltam assets estáticos versionados no repositório:');
    missingAssets.forEach((f) => console.error(`   - public/${f}`));
    console.error('\n   Confira se foram commitados/copiados corretamente.\n');
    process.exit(1);
  }

  console.log(`✅ ${apis.length} bundle(s) de OpenAPI e assets estáticos encontrados. Pode subir o portal.`);
}

main();
