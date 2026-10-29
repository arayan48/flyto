<template lang="pug">
  DialogRoot(:open="true", @update:open="v => v || close()")
    DialogPortal
      DialogOverlay.modal.background-darken(:class="$attrs.class", style="display:block; overflow-y:auto")
        DialogContent.modal-dialog.modal-fluid(:aria-describedby="undefined", @keydown.left="$emit('prev')", @keydown.right="$emit('next')")
          .modal-content
            .modal-header(v-if='hasHeader')
              DialogClose.close(:aria-label="($root.lang && $root.lang.close) || 'Close'")
                span(aria-hidden='true') &times;
              DialogTitle.modal-title(as="h4")
                slot(name='header')
            .modal-body
              slot(name='body')
            .modal-footer(v-if='hasFooter')
              slot(name='footer')
</template>

<script>
  import { DialogRoot, DialogPortal, DialogOverlay, DialogContent, DialogClose, DialogTitle } from 'reka-ui';

  // focus trap, Escape, scroll lock and outside click come from Reka UI
  export default {
    components: { DialogRoot, DialogPortal, DialogOverlay, DialogContent, DialogClose, DialogTitle },
    inheritAttrs: false,
    emits: ['close', 'next', 'prev'],
    props: {
      hasHeader: {
        type: Boolean,
        default: false
      },
      hasFooter: {
        type: Boolean,
        default: false
      }
    },

    methods: {
      close() {
        this.$emit('close');
      }
    }
  }
</script>

<style>
  .background-darken {
    background-color: rgba(14, 20, 32, .6);
  }
</style>
