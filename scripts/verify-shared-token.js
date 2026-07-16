import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';
import { pathToFileURL } from 'node:url';
import { apis, getAuthProvider, SHARED_TOKEN_VARIABLE } from '../apis.manifest.js';

const ROOT = process.cwd();

/**
 * Confere, ANTES do build, que:
 *
 *   1. A API marcada como isAuthProvider realmente tem pelo menos um
 *      `postResponseScript` em descriptions.yaml que grava
 *      `pm.globals.set('<SHARED_TOKEN_VARIABLE>', ...)`.
 *   2. Nenhuma outra API do manifesto tenta gravar a mesma variável (o que
 *      indicaria duas fontes de verdade concorrentes para o token).
 *
 * Isso existe porque o vínculo entre apis.manifest.js (o nome da variável)
 * e src/decorators/<auth>/descriptions.yaml (o script que a grava) é, hoje,
 * só uma convenção de nome — não uma referência de código, porque um é JS e
 * o outro é YAML consumido pelo Redocly. Este script fecha esse buraco.
 */
export function findPostResponseScripts(descriptionsPath) {
  if (!fs.existsSync(descriptionsPath)) return [];
  const doc = yaml.load(fs.readFileSync(descriptionsPath, 'utf8')) || {};
  return Object.entries(doc)
    .filter(([, entry]) => entry && typeof entry.postResponseScript === 'string')
    .map(([key, entry]) => ({ key, script: entry.postResponseScript }));
}

export function scriptSetsVariable(script, variableName) {
  return script.includes(`pm.globals.set('${variableName}'`) || script.includes(`pm.globals.set("${variableName}"`);
}

function main() {
  const provider = getAuthProvider();
  const providerDescriptionsPath = path.resolve(ROOT, `src/decorators/${provider.id}/descriptions.yaml`);
  const providerScripts = findPostResponseScripts(providerDescriptionsPath);

  const setsSharedVar = providerScripts.some(({ script }) => scriptSetsVariable(script, SHARED_TOKEN_VARIABLE));

  if (!setsSharedVar) {
    console.error(
      `\n❌ Nenhum postResponseScript em src/decorators/${provider.id}/descriptions.yaml grava ` +
        `pm.globals.set('${SHARED_TOKEN_VARIABLE}', ...).\n` +
        `   As demais APIs do manifesto esperam consumir essa variável via {{${SHARED_TOKEN_VARIABLE}}} — ` +
        'sem isso, o preenchimento automático do token não vai funcionar.\n'
    );
    process.exit(1);
  }

  const otherApis = apis.filter((api) => !api.isAuthProvider);
  for (const api of otherApis) {
    const scripts = findPostResponseScripts(path.resolve(ROOT, `src/decorators/${api.id}/descriptions.yaml`));
    const conflict = scripts.find(({ script }) => scriptSetsVariable(script, SHARED_TOKEN_VARIABLE));
    if (conflict) {
      console.error(
        `\n❌ src/decorators/${api.id}/descriptions.yaml (operação "${conflict.key}") também grava ` +
          `'${SHARED_TOKEN_VARIABLE}', mas "${api.id}" não é a isAuthProvider no manifesto. ` +
          'Duas fontes gravando a mesma variável global é uma corrida de condição esperando para acontecer.\n'
      );
      process.exit(1);
    }
  }

  console.log(`✅ Token compartilhado ('${SHARED_TOKEN_VARIABLE}') é gravado só por "${provider.id}", como esperado.`);
}

const isMainModule = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMainModule) {
  main();
}
