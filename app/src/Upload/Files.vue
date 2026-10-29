<template lang="pug">
  section.upload-files.card
    input#fileInput.sr-only(type="file", multiple, :disabled="disabled", tabindex="-1", aria-hidden="true",
      @change="onPick")

    button.dropzone(
      v-if="!files.length",
      type="button",
      :class="{ 'is-dragging': dragging }",
      :disabled="disabled",
      @click="triggerFileInput()"
    )
      svg.dropzone-mark(viewBox="-6 -16 122 122", aria-hidden="true")
        path.dropzone-sheet(d="M0 10Q0 0 10 0L51.8 0Q61.8 0 68.87 7.07L92.93 31.13Q100 38.2 100 48.2L100 90Q100 100 90 100L10 100Q0 100 0 90Z")
        path.dropzone-flap(d="M76.04 -5.76Q71.8 -10 77.8 -10L104 -10Q110 -10 110 -4L110 22.2Q110 28.2 105.76 23.96Z")
      span.text-lg.font-semibold {{ $root.lang.dropFilesHere }}
      span.text-sm.muted {{ $t('ui.upload.orBrowse') }}

    template(v-else)
      .card-head
        h2.card-title
          | {{ $root.lang.files }}
          span.faint.font-normal.tnum  · {{ files.length }}
        button.btn.btn-sm(v-if="state === 'new'", type="button", :disabled="disabled", @click="triggerFileInput()")
          icon(name="plus")
          | {{ $t('ui.upload.addFiles') }}
      ul.file-list(:class="{ 'is-dragging': dragging }")
        li.file-row(v-for="file in files", :key="file.id", :class="{ 'has-error': file.error }")
          file-icon.file-row-icon(:file="file._File")
          .min-w-0.flex-1
            .flex.items-baseline.gap-2.min-w-0
              span.file-name(:title="file.name") {{ file.name }}
              span.text-xs.faint.tnum.shrink-0 {{ file.humanSize }}
            p.file-error(v-if="file.error")
              icon(name="exclamation-triangle")
              | {{ file.error }}
            template(v-else-if="state === 'uploading' || state === 'uploaded'")
              .progress.mt-2(v-if="!file.uploaded")
                span(:style="{ width: file.progress.percentage + '%' }")
              p.text-xs.mt-1.file-done(v-else)
                icon(name="check")
                | {{ $t('ui.upload.fileSent') }}
            input.file-comment(v-else, type="text", v-model="file.comment", :disabled="disabled",
              :placeholder="$t('ui.upload.commentPlaceholder')", :aria-label="$root.lang.comment")
          button.btn.btn-ghost.btn-icon.btn-sm(
            v-show="!disabled || bucketSizeError || file.error",
            type="button",
            :title="$t('ui.upload.remove')",
            :aria-label="$t('ui.upload.remove') + ' ' + file.name",
            @click="removeFile(file)"
          )
            icon(name="times")
</template>

<script>
  import dragDrop from 'drag-drop';
  import { mapState, mapActions } from 'pinia';
  import { useUploadStore } from './store';
  import FileIcon from '../common/FileIcon.vue';

  export default {
    name: 'Files',
    components: { FileIcon },

    data() {
      return { dragging: false };
    },

    computed: {
      ...mapState(useUploadStore, ['files', 'state', 'bucketSizeError', 'disabled']),
    },

    mounted() {
      // the whole page accepts dropped files and folders
      this.dragDropCleanup = dragDrop('body', {
        onDrop: files => {
          this.dragging = false;
          this.addFiles(files);
        },
        onDragEnter: () => { this.dragging = !this.disabled; },
        onDragLeave: () => { this.dragging = false; },
      });
    },

    beforeUnmount() {
      this.dragDropCleanup();
    },

    watch: {
      state(state) {
        if (state === 'uploading') this.dragDropCleanup();
      },
    },

    methods: {
      ...mapActions(useUploadStore, ['addFiles', 'removeFile']),
      onPick(e) {
        this.addFiles(e.target.files);
        e.target.value = '';
      },
      triggerFileInput() {
        if (this.disabled) return;
        document.getElementById('fileInput').click();
      },
    },
  };
</script>

<style>
  .dropzone {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: .35rem;
    width: 100%;
    min-height: 21rem;
    padding: 2.5rem 1.5rem;
    border: 1.5px dashed var(--line-strong);
    border-radius: inherit;
    background: transparent;
    color: var(--ink);
    text-align: center;
    cursor: pointer;
    transition: border-color .15s, background-color .15s;
  }
  .dropzone:hover, .dropzone.is-dragging {
    border-color: var(--accent);
    background: var(--accent-soft);
  }
  .dropzone:disabled {
    cursor: not-allowed;
    opacity: .6;
  }
  .dropzone-mark {
    width: 4.5rem;
    margin-bottom: 1rem;
    overflow: visible;
  }
  .dropzone-sheet {
    fill: var(--surface-2);
    stroke: var(--line-strong);
    stroke-width: 3;
    transition: fill .2s, stroke .2s;
  }
  .dropzone-flap {
    fill: var(--sky);
    transition: transform .35s cubic-bezier(.2, .8, .2, 1.2);
  }
  /* the corner of the file takes off, as in the logo */
  .dropzone:hover .dropzone-sheet, .dropzone.is-dragging .dropzone-sheet {
    fill: var(--accent);
    stroke: var(--accent);
  }
  .dropzone:hover .dropzone-flap, .dropzone.is-dragging .dropzone-flap {
    transform: translate(9px, -9px);
  }

  .file-list {
    transition: background-color .15s;
  }
  .file-list.is-dragging {
    background: var(--accent-soft);
  }
  .file-row {
    display: flex;
    align-items: flex-start;
    gap: .85rem;
    padding: .8rem 1.1rem;
    border-bottom: 1px solid var(--line);
  }
  .file-row:last-child {
    border-bottom: 0;
  }
  .file-row-icon {
    flex: none;
  }
  .file-name {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-weight: 600;
  }
  .file-comment {
    width: 100%;
    margin-top: .25rem;
    padding: .15rem 0;
    border: 0;
    border-bottom: 1px dashed transparent;
    background: transparent;
    color: var(--ink-2);
    font: inherit;
    font-size: var(--text-sm);
  }
  .file-comment:hover {
    border-bottom-color: var(--line-strong);
  }
  .file-comment:focus {
    outline: none;
    box-shadow: none;
    border-bottom-color: var(--accent);
    color: var(--ink);
  }
  .file-error, .file-done {
    display: flex;
    align-items: center;
    gap: .35rem;
  }
  .file-error {
    margin-top: .25rem;
    color: var(--danger);
    font-size: var(--text-sm);
  }
  .file-done {
    color: var(--success);
  }
</style>
