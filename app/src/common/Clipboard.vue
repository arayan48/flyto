<!--
# Clipboard Component
Copies a string into the clipboard

## Props
* value: String

## Slots
* default: Replaces inner content
* text:    Replaces the text (hidden with icon-only)
-->

<template lang="pug">
  span(@click.stop='copy()', style='cursor: pointer')
    slot(:state='state')
      icon.fa-fw(name="copy", v-if="state==='pristine'")
      icon.fa-fw(name="check", v-if="state==='copied'")
      icon.fa-fw(name="exclamation-triangle", v-if="state==='error'")
      slot(name='text', v-if='!iconOnly')  {{ $root.lang.clipboard }}
</template>


<script>
  import { useClipboard } from '@vueuse/core';

  export default {
    name: "Clipboard",
    emits: ['change'],
    props: {
      value: {
        type: String,
        required: true
      },
      iconOnly: Boolean
    },
    setup() {
      // legacy: the Clipboard API needs https, a NAS is often reached over plain http
      const { copy } = useClipboard({ legacy: true });
      return { writeClipboard: copy };
    },
    data() {
      return {
        state: 'pristine' // copied, error
      };
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
      }
    }
  };
</script>
