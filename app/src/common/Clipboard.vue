<!--
Copies a string into the clipboard.
Props: value, icon-only (no text, the title says it), label (text instead of "Copy")
-->

<template lang="pug">
  button.btn(type="button", :class="{ 'btn-icon': iconOnly }", :aria-label="iconOnly ? title : null", @click.stop="copy()")
    icon(:name="state === 'copied' ? 'check' : state === 'error' ? 'exclamation-triangle' : 'copy'", :key="state", :class="{ 'icon-pop': state !== 'pristine' }")
    span(v-if="!iconOnly", aria-live="polite") {{ state === 'copied' ? $t('ui.copied') : (label || $t('ui.copy')) }}
</template>

<script>
  import { useClipboard } from '@vueuse/core';

  export default {
    name: 'Clipboard',
    emits: ['change'],
    props: {
      value: {
        type: String,
        required: true,
      },
      iconOnly: Boolean,
      label: String,
    },
    setup() {
      // legacy: the Clipboard API needs https, a NAS is often reached over plain http
      const { copy } = useClipboard({ legacy: true });
      return { writeClipboard: copy };
    },
    data() {
      return { state: 'pristine', timer: null };
    },
    computed: {
      title() {
        return this.$attrs.title || this.$root.lang.copyToClipboard;
      },
    },
    beforeUnmount() {
      clearTimeout(this.timer);
    },
    methods: {
      async copy() {
        try {
          await this.writeClipboard(this.value);
          this.state = 'copied';
        } catch (e) {
          console.error(e);
          this.state = 'error';
        }
        this.$emit('change', this.state);
        clearTimeout(this.timer);
        this.timer = setTimeout(() => { this.state = 'pristine'; }, 2500);
      },
    },
  };
</script>
