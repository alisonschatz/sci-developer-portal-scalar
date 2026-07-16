import { createApp } from 'vue';
import { createHead } from '@unhead/vue/client';
import '@scalar/api-reference/style.css';
import './style.css';
import App from './App.vue';

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
app.mount('#app');
