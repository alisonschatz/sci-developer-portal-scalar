<script setup>
import { computed } from 'vue';
import { ApiReference } from '@scalar/api-reference';
import SidebarBrand from './components/SidebarBrand.vue';
import { buildScalarConfiguration } from './config/scalar.config.js';
import { createTokenBridgeFetch } from './composables/useTokenBridge.js';

// Ponte de token silenciosa: corrige o Authorization das requisições de
// saída com o token capturado da Auth, contornando uma limitação
// conhecida do Scalar (a variável compartilhada não persiste entre
// requisições nessa versão — ver src/composables/useTokenBridge.js e
// docs/arquitetura.md, decisão 14). Nenhuma UI — 100% automático.
const { tokenBridgeFetch } = createTokenBridgeFetch();

// import.meta.env.BASE_URL entra aqui (em vez de dentro de
// buildScalarConfiguration) para a função continuar testável em Node
// puro — ver src/config/scalar.config.js.
const configuration = computed(() => ({
  ...buildScalarConfiguration(import.meta.env.BASE_URL),
  customFetch: tokenBridgeFetch,
}));
</script>

<template>
  <!--
    A marca do portal entra pelo slot oficial `sidebar-start` do
    <ApiReference> (tipado no próprio componente, node_modules/@scalar/api-reference)
    — ela é renderizada DENTRO da árvore/scroll do Scalar, não como um
    header separado por fora. Ver docs/arquitetura.md, decisão 4.
  -->
  <ApiReference :configuration="configuration">
    <template #sidebar-start>
      <SidebarBrand />
    </template>
  </ApiReference>
</template>
