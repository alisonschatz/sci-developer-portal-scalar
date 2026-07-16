import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

/**
 * Regressão: scripts/fetch-api.js e scripts/verify-shared-token.js só
 * chamam main() quando `import.meta.url` bate com o caminho do processo
 * — necessário para poder importar as funções puras deles em outros
 * testes sem disparar chamadas de rede de verdade.
 *
 * A primeira versão dessa checagem comparava
 * `import.meta.url === \`file://${process.argv[1]}\`` — que quebra no
 * Windows, porque `process.argv[1]` vem com barra invertida
 * (`C:\...\fetch-api.js`) e `import.meta.url` vem com barra normal
 * (`file:///C:/.../fetch-api.js`). O resultado era `main()` nunca
 * rodar, sem nenhum erro: `npm run api:fetch` "terminava com sucesso"
 * sem baixar nada. Ver docs/arquitetura.md.
 *
 * Rodar como subprocesso de verdade (não importar o módulo) é
 * proposital: é a única forma de reproduzir esse bug, já que ele só
 * aparece quando o script é o *entry point* do processo Node — que é
 * exatamente como `npm run api:fetch` invoca.
 */
const ROOT = process.cwd();

test('node scripts/fetch-api.js roda main() quando invocado diretamente (sem .env)', () => {
  const scriptPath = path.join(ROOT, 'scripts/fetch-api.js');

  let stdoutAndStderr = '';
  let exitCode = 0;
  try {
    execFileSync('node', [scriptPath], {
      cwd: ROOT,
      encoding: 'utf8',
      env: { ...process.env, AUTH_SOURCE_URL: '', RHNETSOCIAL_SOURCE_URL: '' },
    });
  } catch (err) {
    stdoutAndStderr = `${err.stdout || ''}${err.stderr || ''}`;
    exitCode = err.status;
  }

  // Sem AUTH_SOURCE_URL configurada, main() DEVE reclamar e sair com
  // código != 0. Se main() não rodou (o bug), o processo sai com 0 e
  // sem nenhuma mensagem — é exatamente isso que este teste barra.
  assert.equal(exitCode, 1, 'esperava exit code 1 (variável de ambiente ausente); 0 indicaria que main() não rodou');
  assert.match(stdoutAndStderr, /AUTH_SOURCE_URL não definida/);
});
