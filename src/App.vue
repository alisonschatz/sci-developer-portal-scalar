<script setup>
import { computed } from 'vue';
import { ApiReference } from '@scalar/api-reference';
import SidebarBrand from './components/SidebarBrand.vue';
import { buildScalarConfiguration } from './config/scalar.config.js';

// import.meta.env.BASE_URL entra aqui (em vez de dentro de
// buildScalarConfiguration) para a função continuar testável em Node
// puro — ver src/config/scalar.config.js.
const configuration = computed(() => buildScalarConfiguration(import.meta.env.BASE_URL));
</script>

<template>
  <!--
    A marca do portal entra pelo slot oficial `sidebar-start` do
    <ApiReference> (tipado no próprio componente, node_modules/@scalar/api-reference)
    — ela é renderizada DENTRO da árvore/scroll do Scalar, não como um
    header separado por fora. Ver docs/arquitetura.md, decisão 4.

    Não há mais nenhum overlay de banner de token: com "Gerar JWT" e
    "Atualizar JWT" pré-selecionados e o token compartilhado via
    pm.globals + templating {{sci_auth_token}} (ver apis.manifest.js e
    src/config/scalar.config.js), o preenchimento automático já é a
    experiência principal — o banner existia como uma segunda camada de
    confirmação visual, que deixou de ser necessária. Ver
    docs/arquitetura.md, decisão 10.
  -->
  <ApiReference :configuration="configuration">
    <template #sidebar-start>
      <SidebarBrand />
    </template>
  </ApiReference>
</template>
