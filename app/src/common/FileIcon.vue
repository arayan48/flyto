<template lang="pug">
  div.file-icon
    icon(:name="iconClass", v-if="!isImageBlob", scale="3")
    |
    img(v-if='isImageBlob', :src='blobUrl')
</template>


<script type="text/babel">

  export default {
    props: ['file'],

    computed: {
      iconClass() {
        const type = this.file.type || this.file.metadata && this.file.metadata.type;
        if(!type) return 'file';
        if(type.startsWith('image')) return 'file-image';
        if(type.startsWith('text')) return 'file-alt';
        if(type.startsWith('video')) return 'file-video';
        if(type.startsWith('audio')) return 'file-audio';
        if(type === 'application/pdf') return 'file-pdf';
        if(type.startsWith('application')) return 'file-archive';
        return 'file';
      },
      isImageBlob() {
        return this.file instanceof File && this.file.type.startsWith('image');
      },
      blobUrl() {
        if(!this.isImageBlob) return;
        return URL.createObjectURL(this.file);
      }
    }
  };
</script>
