import { createApp } from 'vue';
import { createHead } from '@unhead/vue/client';
import '@scalar/api-reference/style.css';
import './style.css';
import App from './App.vue';
import { ensureAllMultiSchemeSelections } from './composables/useTokenStorageSync.js';

/**
 * O componente <ApiReference> chama useSeoMeta()/useHead() internamente
 * (para o <title> e meta tags vindos de `metaData` na configuration) —
 * isso exige que o app hospedeiro tenha o plugin do @unhead/vue
 * registrado ANTES do mount, senão o Vue lança
 * "useHead() was called without provide context". Import do subpath
 * `/client` (não o pacote raiz) é o que a documentação atual do
 * @unhead/vue recomenda para apps client-side puros como este.
 */
const app = createApp(App);
const head = createHead();
app.use(head);

// Garante que o topo do documento Auth sempre mostre "Gerar JWT" e
// "Atualizar JWT" disponíveis — mesmo se a chave de auth do Scalar no
// localStorage tiver sido apagada, ou ficado com só um scheme por
// qualquer motivo. Roda ANTES do mount, toda vez que a página carrega
// — ver src/composables/useTokenStorageSync.js e docs/arquitetura.md,
// decisão 17.
ensureAllMultiSchemeSelections(window.localStorage);

app.mount('#app');
