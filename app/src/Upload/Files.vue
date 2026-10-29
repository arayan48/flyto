<template lang="pug">
  section.upload-files
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
      span.dropzone-title {{ $root.lang.dropFilesHere }}
      span.muted {{ $t('ui.upload.orBrowse') }}
      spin-badge.dropzone-badge(:text="$t('ui.upload.badge')")

    template(v-else)
      .card-head
        h2.card-title
          | {{ $root.lang.files }}
          span.faint.font-normal.tnum  · {{ files.length }}
        button.btn.btn-sm(v-if="state === 'new'", type="button", :disabled="disabled", @click="triggerFileInput()")
          icon(name="plus")
          | {{ $t('ui.upload.addFiles') }}
      transition-group.file-list(tag="ul", name="row", :class="{ 'is-dragging': dragging }")
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
              .progress.file-progress.mt-2(v-if="!file.uploaded")
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
  import SpinBadge from '../common/SpinBadge.vue';

  export default {
    name: 'Files',
    components: { FileIcon, SpinBadge },

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
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: .4rem;
    width: calc(100% - 2rem);
    min-height: 22rem;
    margin: 1rem;
    padding: 2.5rem 1.5rem;
    border: 2px dashed var(--line-strong);
    border-radius: calc(var(--radius-lg) - 6px);
    background: var(--bg);
    color: var(--ink);
    text-align: center;
    cursor: pointer;
    transition: border-color .2s, background-color .2s;
  }
  .dropzone:hover, .dropzone.is-dragging {
    border-color: var(--accent);
    background: var(--accent-soft);
  }
  .dropzone:disabled {
    cursor: not-allowed;
    opacity: .6;
  }
  .dropzone-title {
    font-size: clamp(1.5rem, 3vw, 2.1rem);
    font-weight: 750;
    letter-spacing: -0.03em;
  }
  .dropzone-mark {
    width: 5.5rem;
    margin-bottom: 1.25rem;
    overflow: visible;
  }
  .dropzone-sheet {
    fill: var(--surface);
    stroke: var(--ink);
    stroke-width: 3.5;
    transition: fill .2s, stroke .2s;
  }
  .dropzone-flap {
    fill: var(--sky);
    transition: transform .4s cubic-bezier(.2, .8, .2, 1.3);
  }
  /* the corner of the file takes off, as in the logo */
  .dropzone:hover .dropzone-sheet, .dropzone.is-dragging .dropzone-sheet {
    fill: var(--accent);
    stroke: var(--accent);
  }
  .dropzone:hover .dropzone-flap, .dropzone.is-dragging .dropzone-flap {
    transform: translate(14px, -14px) rotate(8deg);
  }
  .dropzone.is-dragging {
    animation: breathe 1.2s ease-in-out infinite alternate;
  }
  .dropzone.is-dragging .spin-badge svg {
    animation-duration: 3s;
  }
  @keyframes breathe {
    to {
      transform: scale(1.012);
    }
  }
  .dropzone-badge {
    position: absolute;
    right: 1.25rem;
    bottom: 1.25rem;
    width: 6.5rem;
  }
  @media (max-width: 40rem) {
    .dropzone {
      min-height: 17rem;
    }
    .dropzone.is-dragging {
    animation: breathe 1.2s ease-in-out infinite alternate;
  }
  .dropzone.is-dragging .spin-badge svg {
    animation-duration: 3s;
  }
  @keyframes breathe {
    to {
      transform: scale(1.012);
    }
  }
  .dropzone-badge {
      display: none;
    }
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
    gap: .9rem;
    padding: .9rem 1.4rem;
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
  /* rows slide in when added and out when removed */
  .row-enter-active, .row-leave-active {
    transition: opacity .25s, transform .3s cubic-bezier(.22, 1, .36, 1);
  }
  .row-enter-from {
    opacity: 0;
    transform: translateY(-10px);
  }
  .row-leave-to {
    opacity: 0;
    transform: translateX(24px);
  }
  .row-leave-active {
    position: absolute;
    width: 100%;
  }
  .row-move {
    transition: transform .3s cubic-bezier(.22, 1, .36, 1);
  }
  .file-list {
    position: relative;
  }
  .file-done .icon {
    animation: pop .4s cubic-bezier(.3, 1.6, .5, 1) both;
  }
  @keyframes pop {
    from {
      transform: scale(0);
    }
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
