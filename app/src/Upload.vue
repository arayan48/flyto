<template lang="pug">
  .upload-app#uploadApp
    template(v-if="state === 'uploaded'")
      ticket(@new-session="newSession")

    template(v-else)
      section.band
        .hero
          .hero-text
            h1.display.rise(v-html="$rich('ui.upload.hero')")
            p.lede.mt-6.rise.rise-2 {{ $t('ui.upload.lede') }}
            p.hero-quota.rise.rise-3(v-if="user && (limits.transfer || limits.storage)")
              template(v-if="limits.transfer") {{ $root.lang.quota.perTransfer }} {{ humanFileSize(limits.transfer) }}
              template(v-if="limits.transfer && limits.storage")  ·
              template(v-if="limits.storage") {{ $root.lang.quota.storage }} {{ humanFileSize(usage.storage) }} / {{ humanFileSize(limits.storage) }}
          flight.hero-flight

      .band-lift
        section.upload-login.card.card-raised.card-body(v-if="showLogin")
          h2.title.mb-3 {{ $root.lang.uploadLogin.title }}
          p.muted.max-w-xl {{ $root.lang.uploadLogin.text }}
          .flex.flex-wrap.gap-3.mt-6
            a.btn.btn-ink.btn-lg(href="login")
              | {{ $root.lang.login }}
              icon.arrow(name="arrow-right")
            a.btn.btn-lg(href="register", v-if="registrationMode === 'open'") {{ $root.lang.nav.register }}
          p.hint.mt-6 {{ $root.lang.uploadLogin.downloadHint }}

        .alert.alert-warning.card-raised(v-else-if="maintenance")
          icon(name="exclamation-triangle")
          div
            strong {{ $root.lang.maintenanceTitle }}
            |  {{ maintenanceMessage || $root.lang.maintenanceDefault }}

        template(v-else-if="$root.configFetched")
          .alert.alert-danger.mb-4(v-if="error", role="alert")
            icon(name="exclamation-triangle")
            span {{ error }}

          .upload-sheet.card.card-raised
            files
            aside.upload-side
              settings
              .upload-action
                template(v-if="state === 'uploading'")
                  .flex.items-baseline.justify-between.gap-3.mb-2
                    span.font-semibold {{ $t('ui.upload.sending') }}
                    span.text-2xl.font-bold.tnum {{ percentUploaded }} %
                  .progress(role="progressbar", :aria-valuenow="percentUploaded", aria-valuemin="0", aria-valuemax="100")
                    span(:style="{ width: percentUploaded + '%' }")
                  p.hint.tnum.mt-2 {{ humanFileSize(bytesUploaded) }} / {{ humanFileSize(bucketSize) }}
                template(v-else)
                  p.text-sm.muted.tnum.mb-3(v-if="files.length")
                    | {{ files.length === 1 ? $t('ui.upload.oneFile') : $t('ui.upload.manyFiles', { count: files.length }) }}
                    |  · {{ humanFileSize(bucketSize) }}
                  button#uploadBtn.btn.btn-ink.btn-lg.w-full(v-if="state === 'new'", :disabled="!canUpload", @click="upload()")
                    | {{ $t('ui.upload.send') }}
                    icon.arrow(name="arrow-right")
                  button#uploadRetryBtn.btn.btn-ink.btn-lg.w-full(v-else-if="state === 'uploadError'", @click="upload()")
                    icon(name="sync-alt")
                    | {{ $root.lang.retry }}
                  p.hint.mt-3(v-if="state === 'new' && requireBucketPassword && !password") {{ $t('ui.upload.passwordRequired') }}
</template>

<script>
  import { mapState, mapActions } from 'pinia';
  import { useUploadStore } from './Upload/store';
  import Settings from './Upload/Settings.vue';
  import Files from './Upload/Files.vue';
  import Ticket from './Upload/Ticket.vue';
  import Flight from './common/Flight.vue';
  import { humanFileSize } from './common/format';

  export default {
    name: 'Upload',
    components: { Settings, Files, Ticket, Flight },

    computed: {
      ...mapState(useUploadStore, ['state', 'files', 'password', 'disabled', 'percentUploaded', 'bucketSize',
        'bytesUploaded', 'config']),
      ...mapState(useUploadStore, { error: 'uploadError' }),
      showLogin() { return this.config.loginRequired; },
      maintenance() { return this.config.maintenance; },
      maintenanceMessage() { return this.config.maintenanceMessage; },
      registrationMode() { return this.config.registrationMode; },
      user() { return this.config.user; },
      limits() { return this.config.limits || {}; },
      usage() { return this.config.usage || {}; },
      requireBucketPassword() { return this.config.requireBucketPassword; },
      canUpload() {
        // a refused file (too large, blocked type) has to be removed first
        return this.files.length > 0
          && !this.files.some(f => f.error)
          && !this.disabled
          && (!this.requireBucketPassword || !!this.password);
      },
    },

    watch: {
      state(val) {
        if (val === 'uploaded' || val === 'uploadError') window.scrollTo({ top: 0 });
      },
    },

    methods: {
      ...mapActions(useUploadStore, ['upload']),
      newSession() {
        document.location.reload();
      },
      humanFileSize,
    },
  };
</script>

<style>
  .hero {
    display: grid;
    align-items: center;
    gap: 2rem;
  }
  @media (min-width: 52rem) {
    .hero {
      grid-template-columns: minmax(0, 1.4fr) minmax(0, 1fr);
    }
  }
  .hero-text {
    max-width: 44rem;
  }
  .hero-quota {
    display: inline-block;
    margin-top: 1.5rem;
    padding: .35rem .9rem;
    border: 1.5px solid rgb(255 255 255 / .4);
    border-radius: var(--radius-full);
    font-size: var(--text-sm);
    font-weight: 600;
  }
  .hero-flight {
    display: none;
  }
  @media (min-width: 52rem) {
    .hero-flight {
      display: block;
    }
  }
  .upload-sheet {
    display: grid;
  }
  @media (min-width: 52rem) {
    .upload-sheet {
      grid-template-columns: minmax(0, 1fr) 21rem;
    }
    .upload-side {
      border-left: 1px solid var(--line);
    }
  }
  .upload-side {
    display: flex;
    flex-direction: column;
  }
  .upload-action {
    margin-top: auto;
    padding: 1.4rem;
    border-top: 1px solid var(--line);
  }
  .upload-login {
    max-width: 44rem;
    padding: 2rem;
  }
</style>
