import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isBlacklisted, filterInternalRoutes } from '../scripts/fetch-api.js';

test('isBlacklisted bloqueia rotas administrativas/internas/debug/healthcheck', () => {
  assert.equal(isBlacklisted('/api/admin/users'), true);
  assert.equal(isBlacklisted('/api/internal/metrics'), true);
  assert.equal(isBlacklisted('/api/_debug/state'), true);
  assert.equal(isBlacklisted('/api/v1/healthcheck'), true);
  assert.equal(isBlacklisted('/api/v1/health-check'), true);
});

test('isBlacklisted NÃO bloqueia rotas de negócio legítimas', () => {
  assert.equal(isBlacklisted('/api/v1/funcionario/preliminar'), false);
  assert.equal(isBlacklisted('/api/v1/feriados'), false);
  assert.equal(isBlacklisted('/api/v1/administracao/relatorio'), false, 'não deve casar por substring solta de "admin"');
});

test('filterInternalRoutes remove só as rotas da blacklist, preservando as demais', () => {
  const spec = {
    paths: {
      '/api/v1/feriados': { get: {} },
      '/api/admin/debug-tokens': { get: {} },
      '/api/v1/funcionario/preliminar': { post: {} },
    },
  };

  const result = filterInternalRoutes(spec, 'teste');

  assert.deepEqual(Object.keys(result.paths).sort(), ['/api/v1/feriados', '/api/v1/funcionario/preliminar']);
});
