import { ref, computed } from 'vue';
import { getAuthProvider } from '../../apis.manifest.js';
import { getTokenConsumerApis } from '../config/scalar.config.js';

/**
 * Captura o token gerado pelo login da API `auth` e expõe o estado
 * necessário para o banner de confirmação (TokenBanner.vue).
 *
 * Por que `customFetch` e não um monkey-patch de `window.fetch` (como na
 * v1 deste portal)?
 *
 * A configuração do Scalar tem uma opção oficial pra isso — `customFetch`
 * — descrita na documentação como a função usada tanto para carregar o
 * OpenAPI quanto para as chamadas de "Test Request" do cliente embutido.
 * Passar uma função aqui é o mecanismo pretendido para observar/adaptar
 * requisições do Scalar, então preferimos isso a sobrescrever
 * `window.fetch` da página inteira (que também intercepta chamadas de
 * QUALQUER outro código na página, não só do Scalar — um efeito colateral
 * desnecessário que a v1 tinha).
 *
 * A camada 1 (preenchimento automático via pm.globals + {{variável}} no
 * campo de auth — ver src/config/scalar.config.js) continua sendo o
 * caminho principal. Este composable é a CAMADA 2, garantida: mesmo que a
 * camada 1 não preencha por algum motivo em uma versão futura do Scalar, a
 * pessoa vê a confirmação visual e pode copiar o token manualmente.
 */
/** Pura, sem dependência de Vue/DOM — testada em test/token-capture.test.js. */
export function matchesLoginRequest(loginRequest, input, init) {
  const url = typeof input === 'string' ? input : input && input.url;
  const method = (init && init.method) || (input && typeof input === 'object' && input.method) || 'GET';
  if (!url) return false;
  return String(method).toUpperCase() === loginRequest.method && url.includes(loginRequest.path);
}

/** Pura, sem dependência de Vue/DOM — testada em test/token-capture.test.js. */
export function extractToken(tokenResponseField, body) {
  const token = body && body[tokenResponseField];
  return typeof token === 'string' && token ? token : null;
}

export function useTokenCapture() {
  const provider = getAuthProvider();
  const consumerApis = getTokenConsumerApis();

  const bannerVisible = ref(false);
  const lastToken = ref(null);
  const copyState = ref('idle'); // 'idle' | 'copied' | 'error'

  function handleLoginResponse(body) {
    const token = extractToken(provider.tokenResponseField, body);
    if (!token) return;
    lastToken.value = token;
    bannerVisible.value = true;
    copyState.value = 'idle';
  }

  /**
   * Passar como `configuration.customFetch` no ApiReference. Nunca deve
   * lançar nem alterar o comportamento normal do fetch — qualquer erro
   * aqui dentro é engolido, e a Response original é sempre retornada
   * intacta (usamos `.clone()` para poder ler o body sem consumir o
   * stream que o próprio Scalar ainda vai ler).
   */
  async function customFetch(input, init) {
    const response = await window.fetch(input, init);

    try {
      if (matchesLoginRequest(provider.loginRequest, input, init) && response.ok) {
        response
          .clone()
          .json()
          .then(handleLoginResponse)
          .catch(() => {});
      }
    } catch {
      // Nunca deixamos isso quebrar uma requisição de verdade.
    }

    return response;
  }

  async function copyToken() {
    if (!lastToken.value) return;
    try {
      await navigator.clipboard.writeText(lastToken.value);
      copyState.value = 'copied';
      setTimeout(() => {
        copyState.value = 'idle';
      }, 1500);
    } catch {
      // Clipboard API pode falhar (permissão negada, contexto não seguro).
      // A pessoa ainda consegue selecionar o token manualmente no painel
      // de autenticação do Scalar.
      copyState.value = 'error';
    }
  }

  function gotoApi(slug) {
    bannerVisible.value = false;
    // O Scalar usa roteamento por hash por padrão para trocar de
    // documento em uma config com múltiplos `sources`. O callback
    // `onDocumentSelect` só OBSERVA a troca — não existe (na versão atual
    // do Scalar) uma API JS para disparar a troca programaticamente, então
    // hash continua sendo o caminho documentado e prático para hospedagem
    // estática (GitHub Pages). Se uma versão futura do Scalar expuser uma
    // API dedicada, é aqui, e só aqui, que precisa mudar.
    window.location.hash = slug;
  }

  function closeBanner() {
    bannerVisible.value = false;
  }

  return {
    bannerVisible,
    lastToken,
    copyState,
    copyLabel: computed(() => (copyState.value === 'copied' ? 'Copiado ✓' : copyState.value === 'error' ? 'Não foi possível copiar' : 'Copiar token')),
    consumerApis,
    customFetch,
    copyToken,
    gotoApi,
    closeBanner,
  };
}
