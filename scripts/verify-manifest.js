import { validateManifest, apis } from '../apis.manifest.js';

const errors = validateManifest();

if (errors.length > 0) {
  console.error('\n❌ apis.manifest.js está inválido:\n');
  for (const err of errors) console.error(`   - ${err}`);
  console.error('\nCorrija o manifesto antes de continuar.\n');
  process.exit(1);
}

console.log(`✅ Manifesto válido — ${apis.length} API(s) configurada(s): ${apis.map((a) => a.id).join(', ')}`);
