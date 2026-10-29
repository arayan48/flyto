<template lang="pug">
  span.file-icon(:class="'file-icon-' + kind")
    img(v-if="blobUrl", :src="blobUrl", alt="")
    icon(v-else, :name="iconName")
</template>

<script>
  const ICONS = {
    image: 'file-image',
    text: 'file-alt',
    video: 'file-video',
    audio: 'file-audio',
    pdf: 'file-pdf',
    archive: 'file-archive',
    file: 'file',
  };

  export default {
    name: 'FileIcon',
    props: ['file'],

    data() {
      return { blobUrl: null };
    },

    computed: {
      kind() {
        const type = this.file.type || (this.file.metadata && this.file.metadata.type) || '';
        if (type.startsWith('image')) return 'image';
        if (type.startsWith('text')) return 'text';
        if (type.startsWith('video')) return 'video';
        if (type.startsWith('audio')) return 'audio';
        if (type === 'application/pdf') return 'pdf';
        if (/zip|tar|rar|7z|compressed|gzip/.test(type)) return 'archive';
        return 'file';
      },
      iconName() {
        return ICONS[this.kind];
      },
    },

    created() {
      // a picked image shows itself, a downloaded one stays an icon
      if (this.file instanceof File && this.kind === 'image' && this.file.size < 20 * 1024 * 1024) {
        this.blobUrl = URL.createObjectURL(this.file);
      }
    },

    beforeUnmount() {
      if (this.blobUrl) URL.revokeObjectURL(this.blobUrl);
    },
  };
</script>

<style>
  .file-icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 2.5rem;
    height: 2.5rem;
    border-radius: var(--radius-md);
    background: var(--surface-2);
    color: var(--ink-2);
    font-size: 1.15rem;
    overflow: hidden;
  }
  .file-icon img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
  .file-icon-image, .file-icon-video {
    color: var(--accent-ink);
    background: var(--accent-soft);
  }
</style>
