<template lang="pug">
  div
    section.band.ticket-band
      p.eyebrow.rise
        icon(name="check")
        |  {{ $root.lang.uploadCompleted }}
      h1.display.mt-3.rise.rise-2(v-html="$rich('ui.ticket.hero')")
    .band-lift.ticket-wrap
      .ticket.card-raised
        .ticket-main
          span.stamp.ticket-stamp {{ $t('ui.ticket.stamp') }}
          p.label.mb-2 {{ $t('ui.ticket.title') }}
          .share-link
            span.sr-only {{ $root.lang.downloadLink }}
            a.share-link-url.mono(:href="shareUrl", target="_blank", rel="noopener") {{ shareUrl }}

          .flex.flex-wrap.gap-2.mt-5
            clipboard.btn-ink.btn-lg(:value="shareUrl", :label="$root.lang.copyToClipboard")
            a.btn.btn-lg(v-if="mailLink", :href="mailLink")
              icon(name="envelope")
              | {{ $root.lang.sendViaMail }}
            button.btn.btn-ghost.btn-lg(type="button", @click="$emit('new-session')")
              icon(name="plus")
              | {{ $root.lang.newUpload }}

          dl.ticket-facts
            div
              dt {{ $root.lang.files }}
              dd.tnum {{ sent.length }}
            div
              dt {{ $t('ui.ticket.size') }}
              dd.tnum {{ humanFileSize(sentSize) }}
            div
              dt {{ $root.lang.retention }}
              dd {{ $root.lang.retentions[retention] || retention }}
            div
              dt {{ $root.lang.password }}
              dd {{ password ? $t('ui.yes') : $t('ui.no') }}

        .ticket-stub(v-if="qrSrc")
          img.ticket-qr(:src="qrSrc", :alt="$root.lang.qrCode", width="148", height="148")
          p.hint.text-center {{ $t('ui.ticket.scan') }}

      ul.ticket-files
        li(v-for="file in files", :key="file.id", :class="{ 'is-failed': file.error }")
          icon(:name="file.error ? 'times' : 'check'")
          span.ticket-file-name {{ file.name }}
          span.faint.tnum(v-if="!file.error") {{ file.humanSize }}
          span.ticket-file-error(v-else) {{ file.error }}
</template>

<script>
  import { mapState } from 'pinia';
  import { Encoder, Byte } from '@nuintun/qrcode';
  import { useUploadStore } from './store';
  import Clipboard from '../common/Clipboard.vue';
  import { humanFileSize } from '../common/format';

  export default {
    name: 'Ticket',
    components: { Clipboard },
    emits: ['new-session'],

    computed: {
      ...mapState(useUploadStore, ['files', 'shareUrl', 'retention', 'password', 'config']),
      sent() {
        return this.files.filter(f => f.uploaded);
      },
      sentSize() {
        return this.sent.reduce((sum, f) => sum + f._File.size, 0);
      },
      mailLink() {
        return this.config.mailTemplate && this.config.mailTemplate.replace('%%URL%%', this.shareUrl);
      },
      qrSrc() {
        if (this.config.disableQrCode) return null;
        return new Encoder({ level: 'M' }).encode(new Byte(this.shareUrl)).toDataURL(5, 2);
      },
    },

    methods: {
      humanFileSize,
    },
  };
</script>

<style>
  .ticket-wrap {
    max-width: 56rem;
  }
  .ticket-band .eyebrow {
    display: inline-flex;
    align-items: center;
    gap: .4rem;
  }
  /* a departure ticket: the stub with the QR code is torn along the perforation */
  .ticket {
    display: grid;
    border-radius: var(--radius-lg);
    background: var(--surface);
  }
  @media (min-width: 40rem) {
    .ticket {
      grid-template-columns: minmax(0, 1fr) auto;
    }
  }
  .ticket-main {
    position: relative;
    padding: 1.5rem;
    min-width: 0;
  }
  .ticket-stamp {
    position: absolute;
    top: 1.25rem;
    right: 1.25rem;
    color: var(--accent);
  }
  .ticket-status {
    display: inline-flex;
    align-items: center;
    gap: .4rem;
    margin-bottom: .6rem;
    color: var(--success);
    font-size: var(--text-sm);
    font-weight: 600;
  }
  .share-link {
    padding: 1rem 1.2rem;
    border-radius: var(--radius-md);
    background: var(--bg);
  }
  .share-link-url {
    display: block;
    color: var(--ink);
    font-size: var(--text-base);
    text-decoration: none;
    overflow-wrap: anywhere;
  }
  @media (min-width: 40rem) {
    .share-link-url {
      font-size: var(--text-lg);
    }
    .ticket-main {
      padding: 2.25rem;
    }
  }
  .share-link-url:hover {
    color: var(--accent-ink);
  }
  .ticket-facts {
    display: flex;
    flex-wrap: wrap;
    gap: 1rem 2rem;
    margin-top: 1.75rem;
    padding-top: 1.25rem;
    border-top: 1px solid var(--line);
  }
  .ticket-facts dt {
    color: var(--ink-3);
    font-size: var(--text-xs);
  }
  .ticket-facts dd {
    margin: 0;
    font-weight: 600;
  }
  .ticket-stub {
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: .75rem;
    padding: 1.75rem 1.5rem;
    border-top: 2px dashed var(--line-strong);
  }
  @media (min-width: 40rem) {
    .ticket-stub {
      width: 13.5rem;
      border-top: 0;
      border-left: 2px dashed var(--line-strong);
    }
  }
  .ticket .share-link, .ticket-facts > div, .ticket-qr {
    animation: rise .6s cubic-bezier(.22, 1, .36, 1) both;
  }
  .ticket .share-link {
    animation-delay: .15s;
  }
  .ticket-facts > div:nth-child(1) { animation-delay: .25s; }
  .ticket-facts > div:nth-child(2) { animation-delay: .3s; }
  .ticket-facts > div:nth-child(3) { animation-delay: .35s; }
  .ticket-facts > div:nth-child(4) { animation-delay: .4s; }
  .ticket-qr {
    animation-delay: .5s;
  }
  .ticket-files li {
    animation: rise .5s cubic-bezier(.22, 1, .36, 1) both;
    animation-delay: .6s;
  }
  .ticket-qr {
    padding: .5rem;
    border-radius: var(--radius-md);
    background: #fff;
    image-rendering: pixelated;
  }
  .ticket-files {
    display: grid;
    gap: .35rem;
    margin-top: 1.25rem;
    padding-inline: .25rem;
    font-size: var(--text-sm);
  }
  .ticket-files li {
    display: flex;
    align-items: baseline;
    gap: .5rem;
    min-width: 0;
  }
  .ticket-files li > .icon {
    flex: none;
    align-self: center;
    color: var(--success);
  }
  .ticket-files li.is-failed > .icon {
    color: var(--danger);
  }
  .ticket-file-name {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .ticket-file-error {
    color: var(--danger);
  }
</style>
