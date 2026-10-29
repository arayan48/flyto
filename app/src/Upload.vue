<template lang="pug">
  .upload-app#uploadApp
    section.upload-login.card.card-body.max-w-xl(v-if="showLogin")
      h1.text-xl.mb-2 {{ $root.lang.uploadLogin.title }}
      p.muted {{ $root.lang.uploadLogin.text }}
      .flex.flex-wrap.gap-2.mt-5
        a.btn.btn-primary(href="login")
          icon(name="sign-in-alt")
          | {{ $root.lang.login }}
        a.btn(href="register", v-if="registrationMode === 'open'") {{ $root.lang.nav.register }}
      p.hint.mt-5 {{ $root.lang.uploadLogin.downloadHint }}

    .alert.alert-warning.max-w-xl(v-else-if="maintenance")
      icon(name="exclamation-triangle")
      div
        strong {{ $root.lang.maintenanceTitle }}
        |  {{ maintenanceMessage || $root.lang.maintenanceDefault }}

    template(v-else-if="$root.configFetched")
      ticket(v-if="state === 'uploaded'", @new-session="newSession")

      template(v-else)
        .flex.flex-wrap.items-end.justify-between.gap-x-6.gap-y-1.mb-5
          h1.text-2xl {{ $t('ui.upload.title') }}
          p.text-sm.faint.tnum(v-if="user && (limits.transfer || limits.storage)")
            template(v-if="limits.transfer") {{ $root.lang.quota.perTransfer }} {{ humanFileSize(limits.transfer) }}
            template(v-if="limits.transfer && limits.storage")  ·
            template(v-if="limits.storage") {{ $root.lang.quota.storage }} {{ humanFileSize(usage.storage) }} / {{ humanFileSize(limits.storage) }}

        .alert.alert-danger.mb-5(v-if="error", role="alert")
          icon(name="exclamation-triangle")
          span {{ error }}

        .upload-grid
          files
          aside.upload-side.card
            settings
            .upload-action
              template(v-if="state === 'uploading'")
                .flex.items-baseline.justify-between.gap-3.mb-2
                  span.text-sm.font-semibold {{ $t('ui.upload.sending') }}
                  span.text-sm.tnum.muted {{ percentUploaded }} %
                .progress(role="progressbar", :aria-valuenow="percentUploaded", aria-valuemin="0", aria-valuemax="100")
                  span(:style="{ width: percentUploaded + '%' }")
                p.hint.tnum.mt-2 {{ humanFileSize(bytesUploaded) }} / {{ humanFileSize(bucketSize) }}
              template(v-else)
                p.text-sm.muted.tnum.mb-3(v-if="files.length")
                  | {{ files.length === 1 ? $t('ui.upload.oneFile') : $t('ui.upload.manyFiles', { count: files.length }) }}
                  |  · {{ humanFileSize(bucketSize) }}
                button#uploadBtn.btn.btn-primary.btn-lg.w-full(v-if="state === 'new'", :disabled="!canUpload", @click="upload()")
                  icon(name="upload")
                  | {{ $t('ui.upload.send') }}
                button#uploadRetryBtn.btn.btn-primary.btn-lg.w-full(v-else-if="state === 'uploadError'", @click="upload()")
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
  import { humanFileSize } from './common/format';

  export default {
    name: 'Upload',
    components: { Settings, Files, Ticket },

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
  .upload-grid {
    display: grid;
    gap: 1.25rem;
    align-items: start;
  }
  @media (min-width: 52rem) {
    .upload-grid {
      grid-template-columns: minmax(0, 1fr) 20rem;
      gap: 1.75rem;
    }
    .upload-side {
      position: sticky;
      top: 1.5rem;
    }
  }
  .upload-action {
    padding: 1.1rem;
    border-top: 1px solid var(--line);
  }
</style>
