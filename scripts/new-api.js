import fs from 'fs';
import path from 'path';

const ROOT = process.cwd();

/**
 * Uso:
 *   npm run api:new -- <id> "<Título>" [securityScheme]
 *
 * Exemplo:
 *   npm run api:new -- folha-pagamento "Folha de Pagamento" bearerAuth
 *
 * Este script NÃO edita apis.manifest.js automaticamente (de propósito —
 * é um arquivo de código que você deve revisar antes de ativar uma API
 * nova em produção). Ele:
 *
 *   1. Cria src/decorators/<id>/ com os 4 arquivos no formato esperado
 *      pelo business-plugin.js, já com o conteúdo mínimo válido.
 *   2. Imprime no terminal o bloco pronto para colar em apis.manifest.js.
 *   3. Imprime as env vars novas que vão faltar em .env / GitHub Secrets.
 */
function main() {
  const [, , id, title, securityScheme] = process.argv;

  if (!id || !title) {
    console.error('Uso: npm run api:new -- <id> "<Título>" [securityScheme]');
    console.error('Exemplo: npm run api:new -- folha-pagamento "Folha de Pagamento" bearerAuth');
    process.exit(1);
  }

  if (!/^[a-z][a-z0-9-]*$/.test(id)) {
    console.error(`id inválido: "${id}". Use kebab-case, começando com letra (ex.: folha-pagamento).`);
    process.exit(1);
  }

  const decoratorsDir = path.resolve(ROOT, `src/decorators/${id}`);
  if (fs.existsSync(decoratorsDir)) {
    console.error(`Já existe src/decorators/${id}/ — apague a pasta antes se quiser recriar do zero.`);
    process.exit(1);
  }
  fs.mkdirSync(decoratorsDir, { recursive: true });

  fs.writeFileSync(
    path.join(decoratorsDir, 'overview.md'),
    `## Sobre esta API\n\n<!-- TODO: o que esta API faz, em 2-3 parágrafos. -->\n\n---\n\n## Pré-requisito: autenticação\n\n> [!WARNING]\n> Toda operação desta API exige um token JWT válido no header \`Authorization: Bearer <token>\`.\n> O token é obtido na aba **"Autenticação"** deste mesmo portal.\n> Sem isso, todas as chamadas abaixo retornam \`401 Unauthorized\`.\n`,
    'utf8'
  );

  fs.writeFileSync(
    path.join(decoratorsDir, 'tags.yaml'),
    `# Chaveado pelo nome EXATO da tag (tags[].name) no spec de origem desta API.\n# Tag sem entrada aqui mantém a descrição original vinda do backend.\n#\n# ExemploDeTag:\n#   description: |\n#     O que esse grupo de endpoints permite fazer, e por qual perfil.\n`,
    'utf8'
  );

  fs.writeFileSync(
    path.join(decoratorsDir, 'descriptions.yaml'),
    `# Chaveado por "MÉTODO /caminho" (estável mesmo se o operationId mudar).\n#\n# "POST /api/v1/exemplo":\n#   summary: Resumo curto\n#   description: O que esse endpoint específico faz.\n`,
    'utf8'
  );

  fs.writeFileSync(path.join(decoratorsDir, 'examples.json'), `{\n  "_comment": "Chaveado por \\"MÉTODO /caminho\\". Use sempre dados sintéticos, nunca reais — ver README (LGPD)."\n}\n`, 'utf8');

  console.log(`\n✅ src/decorators/${id}/ criado.\n`);
  console.log('Cole este bloco em apis.manifest.js, dentro do array `apis` (antes do comentário final):\n');
  console.log('  {');
  console.log(`    id: '${id}',`);
  console.log(`    title: '${title}',`);
  console.log(`    slug: '${id}',`);
  console.log(`    isAuthProvider: false,`);
  console.log(`    sourceUrlEnv: '${id.toUpperCase().replace(/-/g, '_')}_SOURCE_URL',`);
  console.log(`    sourceTokenEnv: '${id.toUpperCase().replace(/-/g, '_')}_AUTH_TOKEN',`);
  console.log(`    serverUrl: 'https://TODO.sci.com.br',`);
  console.log(`    securityScheme: ${securityScheme ? `'${securityScheme}'` : 'null /* TODO: nome do security scheme desta API que deve receber o token compartilhado */'},`);
  console.log(`    default: false,`);
  console.log('  },\n');
  console.log('Depois disso:');
  console.log('  1. npm run manifest:verify   # confere se o manifesto ficou válido');
  console.log('  2. npm run env:example       # atualiza .env.example com as novas variáveis');
  console.log('  3. Preencha as novas variáveis no seu .env e nos GitHub Secrets (ver README).');
  console.log('  4. Preencha os TODOs em src/decorators/' + id + '/overview.md e tags.yaml.\n');
}

main();
