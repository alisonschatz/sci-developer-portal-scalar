<script setup>
defineProps({
  visible: { type: Boolean, required: true },
  copyLabel: { type: String, required: true },
  /** [{ id, title, slug }] — vem de getTokenConsumerApis(), derivado do manifesto. */
  consumerApis: { type: Array, required: true },
});

const emit = defineEmits(['copy', 'goto', 'close']);
</script>

<template>
  <div v-if="visible" class="token-banner" role="status">
    <button class="token-banner__close" type="button" aria-label="Fechar aviso" @click="emit('close')">×</button>

    <div class="token-banner__header">
      <div class="token-banner__icon" aria-hidden="true">✅</div>
      <div class="token-banner__body">
        <strong>Token gerado com sucesso</strong>
        <span>Deve preencher sozinho nas APIs abaixo — confira, ou copie se precisar.</span>
      </div>
    </div>

    <div class="token-banner__actions">
      <button class="token-banner__btn" type="button" @click="emit('copy')">{{ copyLabel }}</button>

      <button
        v-for="api in consumerApis"
        :key="api.id"
        class="token-banner__btn token-banner__btn--primary"
        type="button"
        @click="emit('goto', api.slug)"
      >
        Ir para {{ api.title }} →
      </button>
    </div>
  </div>
</template>

<style scoped>
.token-banner {
  position: fixed;
  right: 20px;
  bottom: 20px;
  z-index: 90;
  width: 340px;
  max-width: calc(100vw - 24px);
  padding: 16px;
  background: var(--sci-bg);
  border: 1px solid var(--sci-border);
  border-radius: 12px;
  box-shadow: 0 16px 36px rgba(23, 29, 44, 0.22);
  animation: token-banner-in 0.18s ease-out;
}

@keyframes token-banner-in {
  from {
    opacity: 0;
    transform: translateY(8px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.token-banner__header {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding-right: 18px;
}

.token-banner__icon {
  flex: none;
  font-size: 18px;
  line-height: 1.3;
}

.token-banner__body {
  flex: 1 1 auto;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.token-banner__body strong {
  font-size: 13.5px;
  color: var(--sci-navy);
}

.token-banner__body span {
  font-size: 12.5px;
  color: var(--sci-text-soft);
  line-height: 1.4;
}

.token-banner__actions {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-top: 12px;
}

.token-banner__btn {
  appearance: none;
  border: 1px solid var(--sci-border);
  background: var(--sci-surface);
  color: var(--sci-navy);
  font-size: 12.5px;
  font-family: inherit;
  font-weight: 550;
  padding: 8px 10px;
  border-radius: 7px;
  cursor: pointer;
}

.token-banner__btn:hover {
  border-color: var(--sci-blue);
  background: rgba(145, 216, 247, 0.28);
}

.token-banner__btn--primary {
  background: var(--sci-blue);
  border-color: var(--sci-blue);
  color: var(--sci-navy);
}

.token-banner__btn--primary:hover {
  filter: brightness(0.96);
}

.token-banner__close {
  position: absolute;
  top: 10px;
  right: 10px;
  appearance: none;
  border: none;
  background: transparent;
  color: var(--sci-text-soft);
  font-size: 16px;
  line-height: 1;
  cursor: pointer;
  padding: 2px;
}

.token-banner__close:hover {
  color: var(--sci-navy);
}

@media (max-width: 420px) {
  .token-banner {
    left: 12px;
    right: 12px;
    bottom: 12px;
    width: auto;
    max-width: none;
  }
}
</style>
