<template lang="pug">
  DialogRoot(:open="true", @update:open="v => v || close()")
    DialogPortal
      DialogOverlay.dialog-overlay
      DialogContent.dialog(:class="$attrs.class", :aria-describedby="undefined",
        @keydown.left="$emit('prev')", @keydown.right="$emit('next')")
        header.dialog-head
          DialogTitle.dialog-title {{ title }}
          .dialog-tools
            slot(name="tools")
            DialogClose.btn.btn-ghost.btn-icon(:aria-label="$t('ui.close')", :title="$t('ui.close')")
              icon(name="times")
        .dialog-body
          slot
</template>

<script>
  import { DialogRoot, DialogPortal, DialogOverlay, DialogContent, DialogClose, DialogTitle } from 'reka-ui';

  // focus trap, Escape, scroll lock and outside click come from Reka UI
  export default {
    name: 'Modal',
    components: { DialogRoot, DialogPortal, DialogOverlay, DialogContent, DialogClose, DialogTitle },
    inheritAttrs: false,
    emits: ['close', 'next', 'prev'],
    props: {
      title: { type: String, default: '' },
    },
    methods: {
      close() {
        this.$emit('close');
      },
    },
  };
</script>

<style>
  .dialog-overlay {
    position: fixed;
    inset: 0;
    z-index: 50;
    background: rgb(10 15 24 / .55);
  }
  .dialog {
    position: fixed;
    inset: 1rem;
    z-index: 51;
    display: flex;
    flex-direction: column;
    max-width: 64rem;
    max-height: calc(100vh - 2rem);
    margin: auto;
    border: 1px solid var(--line);
    border-radius: var(--radius-lg);
    background: var(--surface);
    box-shadow: var(--shadow-pop);
    overflow: hidden;
  }
  .dialog-head {
    display: flex;
    align-items: center;
    gap: 1rem;
    padding: .6rem .6rem .6rem 1.1rem;
    border-bottom: 1px solid var(--line);
  }
  .dialog-title {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: var(--text-base);
    font-weight: 650;
  }
  .dialog-tools {
    display: flex;
    align-items: center;
    gap: .25rem;
    flex: none;
  }
  .dialog-body {
    flex: 1;
    min-height: 0;
    overflow: auto;
  }
</style>
