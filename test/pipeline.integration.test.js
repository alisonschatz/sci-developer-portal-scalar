import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';

/**
 * Este teste roda o Redocly CLI DE VERDADE (não mocka nada) contra as
 * fixtures em test/fixtures/, exatamente como `npm run build:openapi`
 * rodaria contra os specs baixados de produção. Existe para provar, de
 * forma automatizada e repetível, que os decorators de negócio
 * (src/plugins/business-plugin.js) realmente produzem o que o README
 * promete: servers injetados, overview aplicado, x-post-response no
 * login, e a descrição de tag corrigida.
 *
 * Mais lento que os outros testes (invoca um subprocesso), então fica
 * separado num arquivo próprio — dá pra rodar só ele com
 * `node --test test/pipeline.integration.test.js` quando estiver
 * mexendo nos decorators.
 */

const ROOT = process.cwd();
const AUTH_RAW = path.join(ROOT, 'src/base/openapi-auth.json');
const RHNETSOCIAL_RAW = path.join(ROOT, 'src/base/openapi-rhnetsocial.json');
const OUTPUT_DIR = path.join(ROOT, 'public/openapi');

before(() => {
  fs.mkdirSync(path.join(ROOT, 'src/base'), { recursive: true });
  fs.copyFileSync(path.join(ROOT, 'test/fixtures/openapi-auth.fixture.json'), AUTH_RAW);
  fs.copyFileSync(path.join(ROOT, 'test/fixtures/openapi-rhnetsocial.fixture.json'), RHNETSOCIAL_RAW);

  execFileSync('node', [path.join(ROOT, 'scripts/build-openapi.js')], { stdio: 'pipe' });
});

after(() => {
  for (const f of [AUTH_RAW, RHNETSOCIAL_RAW, `${AUTH_RAW}.previous.json`, `${RHNETSOCIAL_RAW}.previous.json`]) {
    fs.rmSync(f, { force: true });
  }
  // Remove só os JSONs gerados pelo teste, preservando o diretório (e o
  // .gitkeep nele) para que `git status` continue limpo depois de rodar
  // `npm test` localmente.
  if (fs.existsSync(OUTPUT_DIR)) {
    for (const file of fs.readdirSync(OUTPUT_DIR)) {
      if (file.endsWith('.json')) fs.rmSync(path.join(OUTPUT_DIR, file), { force: true });
    }
  }
  fs.rmSync(path.join(ROOT, 'redocly.generated.yaml'), { force: true });
});

function readBundle(id) {
  return JSON.parse(fs.readFileSync(path.join(OUTPUT_DIR, `${id}.json`), 'utf8'));
}

test('pipeline gera um bundle final para cada API do manifesto', () => {
  assert.ok(fs.existsSync(path.join(OUTPUT_DIR, 'auth.json')));
  assert.ok(fs.existsSync(path.join(OUTPUT_DIR, 'rhnetsocial.json')));
});

test('add-servers injeta a URL de produção quando o spec de origem não declara servers', () => {
  const auth = readBundle('auth');
  assert.deepEqual(auth.servers, [{ url: 'https://api-auth.sci.com.br', description: 'Produção' }]);

  const rh = readBundle('rhnetsocial');
  assert.deepEqual(rh.servers, [{ url: 'https://api2.rhnetsocial.com.br', description: 'Produção' }]);
});

test('set-overview substitui info.description pelo conteúdo do overview.md', () => {
  const auth = readBundle('auth');
  assert.match(auth.info.description, /API Auth/);
  assert.doesNotMatch(auth.info.description, /placeholder/);
});

test('inject-descriptions grava x-post-response no login, gravando a variável global correta', () => {
  const auth = readBundle('auth');
  const script = auth.paths['/api/v1/auth/credencial/login'].post['x-post-response'];
  assert.ok(script);
  assert.match(script, /pm\.globals\.set\('sci_auth_token'/);
});

test('inject-tag-descriptions corrige a tag Feriado (era "criação, edição e exclusão", vira somente leitura)', () => {
  const rh = readBundle('rhnetsocial');
  const feriadoTag = rh.tags.find((t) => t.name === 'Feriado');
  assert.ok(feriadoTag);
  assert.doesNotMatch(feriadoTag.description, /criação, edição e exclusão/);
  assert.match(feriadoTag.description, /exclusivamente em modo de leitura/);
});

test('tag sem entrada em tags.yaml preserva a descrição original do backend', () => {
  const rh = readBundle('rhnetsocial');
  // No fixture, "Funcionario" TEM entrada em tags.yaml — troca para o texto
  // do decorator, não o "placeholder vindo do backend" do fixture bruto.
  const funcionarioTag = rh.tags.find((t) => t.name === 'Funcionario');
  assert.doesNotMatch(funcionarioTag.description, /placeholder vindo do backend/);
});
