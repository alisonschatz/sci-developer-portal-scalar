import { test, describe, before, after } from 'node:test';
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
 * TUDO que mexe em src/base/openapi-*.json e public/openapi/*.json fica
 * NESTE arquivo, de propósito — nunca espalhado em mais de um arquivo de
 * teste. `node --test` pode rodar arquivos de teste diferentes em
 * paralelo (processos/workers concorrentes); dois arquivos escrevendo no
 * mesmo caminho em disco ao mesmo tempo é uma corrida de condição
 * esperando para acontecer, incluindo entre o backup e o restore um do
 * outro. Um bug real já surgiu de uma versão anterior deste arquivo
 * (ver o comentário grande no before() abaixo) — a correção incluiu
 * consolidar tudo aqui, não só corrigir o backup/restore.
 */

const ROOT = process.cwd();
const AUTH_RAW = path.join(ROOT, 'src/base/openapi-auth.json');
const RHNETSOCIAL_RAW = path.join(ROOT, 'src/base/openapi-rhnetsocial.json');
const OUTPUT_DIR = path.join(ROOT, 'public/openapi');
const AUTH_BUNDLE = path.join(OUTPUT_DIR, 'auth.json');
const RHNETSOCIAL_BUNDLE = path.join(OUTPUT_DIR, 'rhnetsocial.json');

// Todo caminho que este arquivo sobrescreve, em algum dos testes.
const MANAGED_FILES = [AUTH_RAW, RHNETSOCIAL_RAW, AUTH_BUNDLE, RHNETSOCIAL_BUNDLE];

/** Lê o conteúdo atual de cada caminho da lista (o que não existir vira
 *  "ausente" no Map) — usado para poder restaurar exatamente esse
 *  estado depois, em vez de apagar cegamente. */
function backupFiles(files) {
  const backups = new Map();
  for (const file of files) {
    if (fs.existsSync(file)) backups.set(file, fs.readFileSync(file));
  }
  return backups;
}

/** Restaura cada caminho da lista ao que estava no backup (ou remove,
 *  se o backup não tinha esse arquivo — ou seja, ele não existia antes). */
function restoreFiles(files, backups) {
  for (const file of files) {
    if (backups.has(file)) {
      fs.writeFileSync(file, backups.get(file));
    } else {
      fs.rmSync(file, { force: true });
    }
  }
}

function backupManagedFiles() {
  return backupFiles(MANAGED_FILES);
}

function restoreManagedFiles(backups) {
  restoreFiles(MANAGED_FILES, backups);
}

/** Copia as fixtures para src/base/ e roda o pipeline real (lint+bundle),
 *  gerando os bundles finais em public/openapi/. */
function buildFromFixtures() {
  fs.mkdirSync(path.join(ROOT, 'src/base'), { recursive: true });
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  fs.copyFileSync(path.join(ROOT, 'test/fixtures/openapi-auth.fixture.json'), AUTH_RAW);
  fs.copyFileSync(path.join(ROOT, 'test/fixtures/openapi-rhnetsocial.fixture.json'), RHNETSOCIAL_RAW);
  execFileSync('node', [path.join(ROOT, 'scripts/build-openapi.js')], { stdio: 'pipe' });
}

let fileLevelBackup;

before(() => {
  /**
   * BUG REAL ENCONTRADO EM PRODUÇÃO (GitHub Actions run #4): no workflow
   * de deploy, `npm run build:openapi` rodava ANTES de `npm test` — ou
   * seja, quando este teste começava, `public/openapi/auth.json` e
   * `rhnetsocial.json` já eram os bundles REAIS, recém-gerados a partir
   * dos specs de produção. A versão anterior deste teste sobrescrevia
   * esses arquivos com as fixtures e, no `after()`, apagava TODO `.json`
   * da pasta como "limpeza" — destruindo os bundles reais antes do
   * `vite build` rodar. O deploy publicava um site sem `openapi/auth.json`
   * (404 no console, Scalar mostrando "Document could not be loaded").
   *
   * Por isso: qualquer arquivo gerenciado que já exista é salvo em
   * memória antes de ser sobrescrito, e restaurado no `after()` — nunca
   * apagado indiscriminadamente. Isso deixa o teste seguro independente
   * da ordem em que os scripts de npm rodam, no CI ou localmente. A
   * suíte `describe('proteção contra apagar conteúdo real', ...)` no
   * fim deste arquivo é a regressão dedicada a essa garantia.
   */
  fileLevelBackup = backupManagedFiles();
  buildFromFixtures();
});

after(() => {
  restoreManagedFiles(fileLevelBackup);
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

test('tag sem entrada em tags.yaml preserva a descrição original do backend (comportamento padrão)', () => {
  const rh = readBundle('rhnetsocial');
  // Hoje, rhnetsocial/tags.yaml está limpo (sem overrides — ver
  // docs/arquitetura.md, decisão 12) — então TODA tag deve manter o
  // texto original do fixture, sem substituição nenhuma.
  const feriadoTag = rh.tags.find((t) => t.name === 'Feriado');
  const funcionarioTag = rh.tags.find((t) => t.name === 'Funcionario');
  assert.match(feriadoTag.description, /vindo do backend/);
  assert.match(funcionarioTag.description, /vindo do backend/);
});

test('inject-tag-descriptions aplica um override quando tags.yaml tem uma entrada (mecanismo, independente do conteúdo real atual)', () => {
  // Este teste escreve uma sobrescrita TEMPORÁRIA em tags.yaml — não usa
  // o conteúdo real do projeto (que muda conforme o trabalho de
  // "engenharia de escrita" avança) — para não acoplar "o mecanismo
  // funciona" a "o texto X está presente hoje". Foi reescrito assim
  // depois de uma limpeza de conteúdo real ter quebrado a versão
  // anterior deste teste — ver docs/arquitetura.md, decisão 12.
  const tagsPath = path.join(ROOT, 'src/decorators/rhnetsocial/tags.yaml');
  const backup = backupFiles([tagsPath]);

  try {
    fs.writeFileSync(
      tagsPath,
      'Feriado:\n  description: |\n    TEXTO DE TESTE — sobrescrita temporária, nunca deveria ir pro repositório de verdade.\n'
    );

    execFileSync('node', [path.join(ROOT, 'scripts/build-openapi.js')], { stdio: 'pipe' });

    const rh = readBundle('rhnetsocial');
    const feriadoTag = rh.tags.find((t) => t.name === 'Feriado');
    assert.match(feriadoTag.description, /TEXTO DE TESTE/);
    assert.doesNotMatch(feriadoTag.description, /placeholder vindo do backend/);
  } finally {
    restoreFiles([tagsPath], backup);
    // Reconstrói com o tags.yaml real de volta, para não deixar o
    // bundle em disco refletindo a sobrescrita temporária depois deste
    // teste (os testes anteriores neste arquivo já rodaram e não serão
    // reexecutados, mas deixar o estado limpo evita confusão em quem
    // for debugar manualmente depois de rodar a suíte).
    execFileSync('node', [path.join(ROOT, 'scripts/build-openapi.js')], { stdio: 'pipe' });
  }
});

describe('proteção contra apagar conteúdo real pré-existente (regressão do bug em produção)', () => {
  test('conteúdo gerenciado sobrevive a uma segunda rodada completa do pipeline por cima', () => {
    const FAKE_RAW = JSON.stringify({
      openapi: '3.0.0',
      info: { title: 'CONTEÚDO REAL — NÃO PODE SER PERDIDO', version: '1.0.0' },
      paths: {},
    });
    const FAKE_BUNDLE = JSON.stringify({
      openapi: '3.0.0',
      info: { title: 'BUNDLE REAL — NÃO PODE SER PERDIDO', version: '1.0.0' },
      paths: {},
    });

    // Neste ponto, o before() do arquivo já rodou os testes acima com o
    // conteúdo das fixtures — não importa o que está lá agora, o ponto
    // deste teste é: seja lá o que for, precisa sobreviver intacto a uma
    // rodada do pipeline por cima. Guarda esse estado pra restaurar no
    // fim (senão este teste "vaza" pros testes anteriores, se a ordem
    // dentro do arquivo mudar no futuro).
    const outerBackup = backupManagedFiles();

    fs.writeFileSync(AUTH_RAW, FAKE_RAW);
    fs.writeFileSync(RHNETSOCIAL_RAW, FAKE_RAW);
    fs.writeFileSync(AUTH_BUNDLE, FAKE_BUNDLE);
    fs.writeFileSync(RHNETSOCIAL_BUNDLE, FAKE_BUNDLE);

    // O MESMO ciclo que before()/after() do arquivo fazem — chamado
    // diretamente, no mesmo processo, sem spawnar outro `node --test`
    // nem depender de um segundo arquivo mexendo nos mesmos caminhos.
    const fakeContentBackup = backupManagedFiles(); // == o FAKE_* que acabamos de escrever
    buildFromFixtures();
    restoreManagedFiles(fakeContentBackup);

    try {
      for (const [file, expected] of [
        [AUTH_RAW, FAKE_RAW],
        [RHNETSOCIAL_RAW, FAKE_RAW],
        [AUTH_BUNDLE, FAKE_BUNDLE],
        [RHNETSOCIAL_BUNDLE, FAKE_BUNDLE],
      ]) {
        assert.ok(fs.existsSync(file), `${file} deveria continuar existindo`);
        assert.equal(
          fs.readFileSync(file, 'utf8'),
          expected,
          `${file} deveria ter sido restaurado ao conteúdo original, não ficar com a fixture nem ser apagado`
        );
      }
    } finally {
      restoreManagedFiles(outerBackup);
    }
  });
});
