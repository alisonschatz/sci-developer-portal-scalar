<script setup>
import { computed } from 'vue';
import { ApiReference } from '@scalar/api-reference';
import SidebarBrand from './components/SidebarBrand.vue';
import TokenBanner from './components/TokenBanner.vue';
import { buildScalarConfiguration } from './config/scalar.config.js';
import { useTokenCapture } from './composables/useTokenCapture.js';

const { bannerVisible, copyLabel, consumerApis, customFetch, copyToken, gotoApi, closeBanner } = useTokenCapture();

// customFetch entra na configuration do Scalar — é o hook oficial deles
// para ver/adaptar toda requisição que o Scalar faz (carga de spec E
// "Test Request" do cliente embutido). Ver src/composables/useTokenCapture.js
// para o porquê disso substituir o monkey-patch de window.fetch da v1.
const configuration = computed(() => ({
  ...buildScalarConfiguration(import.meta.env.BASE_URL),
  customFetch,
}));
</script>

<template>
  <!--
    A marca do portal entra pelo slot oficial `sidebar-start` do
    <ApiReference> (tipado no próprio componente, node_modules/@scalar/api-reference)
    — ela é renderizada DENTRO da árvore/scroll do Scalar, não como um
    header separado por fora. Essa troca resolveu um bug real: um
    header próprio fora do Scalar, mesmo usando a CSS var oficial deles
    para reservar espaço, ainda disputava a mesma área de scroll e
    "sumia"/desalinhava ao rolar. Dentro do slot, não existem dois
    sistemas de layout competindo — só um, o do próprio Scalar.
    Ver docs/arquitetura.md, decisão 8.
  -->
  <ApiReference :configuration="configuration">
    <template #sidebar-start>
      <SidebarBrand />
    </template>
  </ApiReference>

  <TokenBanner
    :visible="bannerVisible"
    :copy-label="copyLabel"
    :consumer-apis="consumerApis"
    @copy="copyToken"
    @goto="gotoApi"
    @close="closeBanner"
  />
</template>
