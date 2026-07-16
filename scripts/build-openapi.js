import { execFileSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';
import { apis, validateManifest } from '../apis.manifest.js';

const ROOT = process.cwd();
const require = createRequire(import.meta.url);

/**
 * Resolve o entry point JS real do @redocly/cli (bin/cli.js) e o executa
 * via `node <cli.js> ...args` em vez de chamar node_modules/.bin/redocly
 * diretamente.
 *
 * Por quê: node_modules/.bin/redocly é um SYMLINK/shell script no
 * Linux/macOS (funciona com execFileSync sem shell), mas no Windows o
 * npm cria `redocly.cmd` e `redocly.ps1` — o arquivo `redocly` sem
 * extensão também existe, mas é um script POSIX que o Windows não sabe
 * executar como binário nativo. `execFileSync(REDOCLY_BIN, args)` sem
 * `shell: true` falhava aí SEM chegar a rodar nada (nenhuma saída do
 * lint aparecia, só o "Falhou em: lint" do catch). Resolver o cli.js e
 * rodar com o MESMO `node` que já está executando este script
 * (`process.execPath`) funciona identicamente nas duas plataformas,
 * sem depender de nenhum shim gerado pelo gerenciador de pacotes.
 */
const REDOCLY_CLI_ENTRY = require.resolve('@redocly/cli/bin/cli.js');
const CONFIG_PATH = path.resolve(ROOT, 'redocly.generated.yaml');
const OUTPUT_DIR = path.resolve(ROOT, 'public/openapi');

function run(args, label) {
  console.log(`\n[build-openapi] $ redocly ${args.join(' ')}`);
  try {
    execFileSync(process.execPath, [REDOCLY_CLI_ENTRY, ...args], { stdio: 'inherit' });
  } catch (err) {
    console.error(`\n[build-openapi] Falhou em: ${label}`);
    process.exit(err.status || 1);
  }
}

function main() {
  const errors = validateManifest();
  if (errors.length > 0) {
    console.error('[build-openapi] apis.manifest.js está inválido — rode `npm run manifest:verify` para detalhes.');
    process.exit(1);
  }

  // 1) Regenera redocly.generated.yaml a partir do manifesto — garante que
  //    nunca vamos lintar/empacotar com uma config desatualizada.
  execFileSync('node', [path.resolve(ROOT, 'scripts/generate-redocly-config.js')], { stdio: 'inherit' });

  // 1b) Garante que a API de auth realmente grava a variável global que as
  //     outras APIs esperam consumir — ver scripts/verify-shared-token.js.
  execFileSync('node', [path.resolve(ROOT, 'scripts/verify-shared-token.js')], { stdio: 'inherit' });

  // 2) Lint de todos os specs brutos de uma vez (mais rápido que um por um,
  //    e a mensagem de erro já indica qual arquivo falhou).
  const rawSpecPaths = apis.map((api) => `src/base/openapi-${api.id}.json`);
  const missing = rawSpecPaths.filter((p) => !fs.existsSync(path.resolve(ROOT, p)));
  if (missing.length > 0) {
    console.error('\n[build-openapi] Faltam specs brutos — rode `npm run api:fetch` antes:');
    missing.forEach((p) => console.error(`   - ${p}`));
    process.exit(1);
  }
  run(['lint', ...rawSpecPaths, '--config', CONFIG_PATH], 'lint');

  // 3) Bundle: um arquivo final por API, direto em public/openapi/, que é
  //    onde o app Vue (via fetch em tempo de execução) e o `vite build`
  //    (via cópia estática da pasta public/) vão pegar os JSONs finais.
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  for (const api of apis) {
    const outFile = path.join(OUTPUT_DIR, `${api.id}.json`);
    run(['bundle', api.id, '-o', outFile, '--config', CONFIG_PATH], `bundle (${api.id})`);
  }

  console.log(`\n[build-openapi] ${apis.length} bundle(s) gerado(s) em ${OUTPUT_DIR}.`);
}

main();
