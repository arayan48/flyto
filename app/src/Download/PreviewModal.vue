<template lang="pug">
  modal.preview-modal(v-if="current", :title="current.metadata.name", @close="current = false", @next="next", @prev="prev")
    template(#tools)
      span.text-xs.faint.tnum.mr-2(v-if="files.length > 1") {{ currentIndex + 1 }} / {{ files.length }}
      button.btn.btn-ghost.btn-icon(v-if="current.previewType === 'text'", type="button", :aria-pressed="lineWrap",
        :title="$t('ui.preview.wrap')", :aria-label="$t('ui.preview.wrap')", @click="lineWrap = !lineWrap")
        icon(name="undo-alt", flip="vertical")
      button.btn.btn-ghost.btn-icon(v-if="files.length > 1", type="button", :disabled="currentIndex <= 0",
        :title="$t('ui.preview.previous')", :aria-label="$t('ui.preview.previous')", @click="prev")
        icon(name="arrow-left")
      button.btn.btn-ghost.btn-icon(v-if="files.length > 1", type="button", :disabled="currentIndex >= files.length - 1",
        :title="$t('ui.preview.next')", :aria-label="$t('ui.preview.next')", @click="next")
        icon(name="arrow-right")
    .preview-image(v-if="current.previewType === 'image'")
      img(:src="current.url + '?preview'", :alt="current.metadata.name")
    pre.preview-text(v-else-if="current.previewType === 'text'", :class="{ 'is-wrapped': lineWrap }") {{ previewText }}
    p.p-8.text-center.muted(v-else) {{ $root.lang.noPreviewAvailable }}
</template>
<script type="text/babel">
  import Modal from '../common/Modal.vue';

  export default {
    components: { Modal },
    emits: ['close'],
    props: ['preview', 'files', 'maxSize'],
    data() {
      return {
        previewText: '',
        lineWrap: false,
        current: false
      };
    },

    computed: {
      currentIndex: function() {
        return this.files.indexOf(this.current);
      }
    },

    watch: {
      preview: function(preview) {
        this.current = preview
      },
      current: function(val, old) {
        if(val === false) this.$emit('close');
        if(val.previewType === 'text' && val !== old) this.getPreviewText();
      },
    },

    methods: {
      next() {
        if(this.currentIndex >= this.files.length-1) return;
        this.current = this.files[this.currentIndex + 1];
      },

      prev() {
        if(this.currentIndex <= 0) return;
        this.current = this.files[this.currentIndex - 1];
      },

      getPreviewText() {
        this.previewText = '';
        const xhr = new XMLHttpRequest();
        xhr.open('GET', this.current.url + '?preview');
        xhr.onload = () => {
          if(xhr.status === 200) {
            this.previewText = xhr.responseText
          } else {
            this.previewText = `${xhr.status} ${xhr.statusText}: ${xhr.responseText}`;
          }
        };
        xhr.send();
      },
    }
  };
</script>

<style>
  .preview-image {
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 100%;
    padding: 1rem;
    background: var(--surface-2);
  }
  .preview-image img {
    max-width: 100%;
    max-height: calc(100vh - 8rem);
    object-fit: contain;
  }
  .preview-text {
    margin: 0;
    padding: 1rem 1.25rem;
    font-family: var(--font-mono);
    font-size: var(--text-sm);
    line-height: 1.6;
    white-space: pre;
    tab-size: 4;
  }
  .preview-text.is-wrapped {
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }
</style>
