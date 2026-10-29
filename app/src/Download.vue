<template lang="pug">
  .download-app
    template(v-if="error")
      section.band
        h1.title.max-w-3xl.rise {{ error }}
        a.btn.btn-ink.btn-lg.mt-8(:href="$root.baseURI + '/'") {{ $root.lang.newUpload }}

    template(v-else-if="needsPassword")
      section.band
        h1.display.rise(v-html="$rich('ui.download.lockedHero')")
        p.lede.mt-5.rise.rise-2 {{ $t('ui.download.lockedText') }}
      .band-lift
        form.unlock.card.card-raised.form-card(@submit.prevent="password && fetchBucket()")
          .field
            label.label(for="downloadPassword") {{ $root.lang.password }}
            input#downloadPassword.input.input-mono(type="password", v-model="password", autocomplete="off", autofocus,
              :aria-invalid="passwordWrong ? 'true' : null")
            p.text-sm.text-danger(v-if="passwordWrong", role="alert")
              strong {{ $root.lang.accessDenied }}
          button.decrypt.btn.btn-ink.btn-lg.w-full(type="submit", :disabled="!password")
            | {{ $root.lang.decrypt }}
            icon.arrow(name="arrow-right")

    section.band(v-else-if="loading")
      p.lede
        icon(name="spinner", spin)
        |  {{ $t('ui.loading') }}

    template(v-else)
      section.band
        .download-head
          div
            h1.display.rise(v-html="files.length === 1 ? $rich('ui.download.heroOne') : $rich('ui.download.hero', { count: files.length })")
            p.lede.mt-5.tnum.rise.rise-2
              | {{ humanFileSize(totalSize) }}
              template(v-if="oneTime")  · {{ $root.lang.retentions['one-time'] }}
              template(v-else-if="expiresAt")  · {{ $t('ui.download.until', { date: $date(expiresAt) }) }}
          .flex.flex-wrap.gap-2.btn-download-archive.rise.rise-3(v-if="downloadsAvailable && files.length > 1")
            a.btn.btn-ink.btn-lg(:href="archiveUrl('zip')", :title="$root.lang.zipDownload", @click="markAll()")
              icon(name="download")
              | {{ $t('ui.download.all') }}
            a.btn.btn-lg(:href="archiveUrl('tar.gz')", :title="$root.lang.tarGzDownload", @click="markAll()") .tar.gz

      .band-lift
        ul.manifest.card.card-raised
          li.manifest-row(v-for="file in files", :key="file.key", :class="{ 'is-done': file.downloaded }")
            file-icon(:file="file")
            button.manifest-main(type="button", @click="download(file)")
              span.manifest-name {{ file.metadata.name }}
              span.manifest-meta.tnum
                template(v-if="isFinite(file.size)") {{ humanFileSize(file.size) }}
                span.downloaded(v-if="file.downloaded")
                  icon(name="check")
                  | {{ $t('ui.download.done') }}
              span.manifest-comment(v-if="file.metadata.comment") {{ file.metadata.comment }}
            .manifest-actions
              button.btn.btn-ghost.btn-icon(v-if="file.previewType", type="button", :title="$root.lang.preview",
                :aria-label="$root.lang.preview", @click="preview = file")
                icon(name="eye")
              clipboard.btn-ghost(:value="$root.baseURI + file.url", icon-only, :title="$root.lang.copyToClipboard",
                @change="copied(file, $event)")
              button.btn.btn-icon.manifest-download(type="button", :title="$t('ui.download.one')", :aria-label="$t('ui.download.one')",
                @click="download(file)")
                icon(name="download")

    preview-modal(:preview="preview", :files="previewFiles", :max-size="config.maxPreviewSize", @close="preview = false")
</template>

<script>
  import FileIcon from './common/FileIcon.vue';
  import Clipboard from './common/Clipboard.vue';
  import PreviewModal from './Download/PreviewModal.vue';
  import { humanFileSize } from './common/format';

  function getPreviewType(file, maxSize) {
    if (!file || !file.metadata) return false;
    if (file.metadata.retention === 'one-time') return false;
    if (file.size > maxSize) return false;
    if (file.metadata.type && file.metadata.type.match(/^image\/.*/)) return 'image';
    if (file.metadata.type && file.metadata.type.match(/(text\/|xml|json|javascript|x-sh)/)
      || file.metadata.name && file.metadata.name
        .match(/\.(jsx|vue|sh|pug|less|scss|sass|c|h|conf|log|bat|cmd|lua|class|java|py|php|yml|sql|md)$/)) {
      return 'text';
    }
    return false;
  }

  export default {
    name: 'Download',
    components: { FileIcon, Clipboard, PreviewModal },

    data() {
      return {
        files: [],
        sid: document.location.pathname.match(/^.*\/([^/?#]+)/)[1],
        passwordWrong: false,
        needsPassword: false,
        loading: true,
        password: '',
        error: '',
        config: {},
        archiveToken: '',
        expiresAt: null,
        preview: false,
      };
    },

    computed: {
      downloadsAvailable() {
        if (!this.archiveToken) return false;
        return this.files.some(f => !f.downloaded || f.metadata.retention !== 'one-time');
      },
      previewFiles() {
        return this.files.filter(f => !!f.previewType);
      },
      totalSize() {
        return this.files.reduce((sum, f) => sum + (+f.size || 0), 0);
      },
      oneTime() {
        return this.files.some(f => f.metadata.retention === 'one-time');
      },
    },

    beforeMount() {
      this.fetchBucket();
    },

    methods: {
      humanFileSize,

      isFinite(value) {
        return typeof value === 'number' && Number.isFinite(value);
      },

      download(file) {
        if (file.downloaded && file.metadata.retention === 'one-time') {
          alert(this.$root.lang.oneTimeDownloadExpired);
          return;
        }
        const a = document.createElement('a');
        a.href = file.url;
        a.download = file.metadata.name;
        a.style.display = 'none';
        document.body.appendChild(a);
        a.click();
        a.remove();
        file.downloaded = true;
      },

      archiveUrl(format) {
        return `${ this.$root.baseURI }/files/${ this.sid }++${ this.archiveToken }.${ format }`;
      },

      markAll() {
        this.files.forEach(f => { f.downloaded = true; });
      },

      copied(file, state) {
        if (state === 'copied') file.downloaded = true;
      },

      async fetchBucket() {
        const headers = {};
        if (this.password) headers['x-download-pass'] = encodeURIComponent(this.password);
        let res;
        try {
          res = await fetch(this.sid + '.json', { headers, credentials: 'same-origin' });
        } catch (e) {
          this.error = this.$root.lang.errors.serverError;
          return;
        }
        this.loading = false;
        if (res.ok) {
          const data = await res.json();
          this.config = data.config;
          this.archiveToken = data.archiveToken || '';
          this.expiresAt = data.expiresAt || null;
          this.files = data.items.map(f => Object.assign(f, {
            downloaded: false,
            previewType: getPreviewType(f, this.config.maxPreviewSize),
          }));
          this.needsPassword = false;
        } else if (res.status === 401) {
          if (this.needsPassword) this.passwordWrong = true;
          this.needsPassword = true;
        } else if (res.status === 451) {
          this.error = this.$root.lang.transferSuspended;
        } else if (res.status === 429) {
          this.error = this.$root.lang.tooManyAttempts;
        } else {
          this.error = res.status === 404 ? this.$root.lang.errors.transferNotFound : this.$root.lang.errors.serverError;
        }
      },
    },
  };
</script>

<style>
  .unlock {
    max-width: 28rem;
  }
  .download-head {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-end;
    justify-content: space-between;
    gap: 1.5rem 2rem;
  }
  .download-head h1 {
    max-width: 48rem;
    overflow-wrap: anywhere;
  }
  .manifest-row {
    display: flex;
    align-items: center;
    gap: 1rem;
    padding: 1rem 1.1rem 1rem 1.4rem;
    border-bottom: 1px solid var(--line);
  }
  .manifest-row:last-child {
    border-bottom: 0;
  }
  .manifest-main {
    display: grid;
    flex: 1;
    min-width: 0;
    padding: 0;
    border: 0;
    background: none;
    color: inherit;
    font: inherit;
    text-align: left;
    cursor: pointer;
  }
  .manifest-main:hover .manifest-name {
    color: var(--accent-ink);
  }
  .manifest-name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: var(--text-lg);
    font-weight: 650;
    letter-spacing: -0.015em;
  }
  .manifest-meta {
    display: flex;
    gap: .75rem;
    color: var(--ink-3);
    font-size: var(--text-xs);
  }
  .manifest-comment {
    margin-top: .2rem;
    color: var(--ink-2);
    font-size: var(--text-sm);
  }
  .downloaded {
    display: inline-flex;
    align-items: center;
    gap: .25rem;
    color: var(--success);
  }
  .manifest-actions {
    display: flex;
    gap: .25rem;
    flex: none;
  }
  .manifest-download {
    border-color: var(--ink);
    background: var(--ink);
    color: var(--bg);
  }
  .manifest-download:hover {
    background: var(--accent);
    border-color: var(--accent);
    color: #fff;
  }
  .manifest-row.is-done .manifest-download {
    border-color: var(--line-strong);
    background: transparent;
    color: var(--ink-3);
  }
</style>
