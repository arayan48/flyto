<template lang="pug">
  .upload-app#uploadApp
    a.btn.btn-sm.btn-info.btn-new-session(
      v-if='!showLogin && !maintenance',
      @click='newSession()',
      @keydown.enter.prevent='newSession()',
      @keydown.space.prevent='newSession()',
      :title='$root.lang.newUpload',
      tabindex="-1",
      role="button"
    )
      icon.fa-fw(name="cloud-upload-alt")
      span.hidden-xs  {{ $root.lang.newUpload }}
    .alert.alert-danger(v-show="error")
      strong
        icon.fa-fw(name="exclamation-triangle")
        |  {{ error }}
    .well.upload-login(v-if='showLogin')
      h3 {{ $root.lang.uploadLogin.title }}
      p {{ $root.lang.uploadLogin.text }}
      p.text-muted {{ $root.lang.uploadLogin.downloadHint }}
      a.btn.btn-primary(href="login")
        icon.fa-fw(name="sign-in-alt")
        |  {{ $root.lang.login }}
      |
      a.btn.btn-default(href="register", v-if="registrationMode === 'open'") {{ $root.lang.nav.register }}
    .alert.alert-warning(v-else-if="maintenance")
      strong {{ $root.lang.maintenanceTitle }}
      |  {{ maintenanceMessage || $root.lang.maintenanceDefault }}
    div(v-else-if="$root.configFetched")
      .well(v-show="state === 'uploaded'")
        .pull-right.btn-group.upload-success-btns
          a.btn.btn-primary(
            v-if="!disableQrCode",
            @click.prevent="showQrCode",
            @keydown.enter.prevent="showQrCode",
            @keydown.space.prevent="showQrCode",
            href="#",
            :title="$root.lang.showQrCode",
            tabindex="0",
            role="button"
          )
            icon.fa-fw(name="qrcode")
            |  {{ $root.lang.qrCode }}
          a.btn.btn-primary(
            :href="mailLnk",
            :title="$root.lang.sendViaMail",
            tabindex="0"
          )
            icon.fa-fw(name="envelope")
            |  {{ $root.lang.email }}
          clipboard.btn.btn-primary(
            :value='shareUrl',
            :title="$root.lang.copyToClipboard",
            tabindex="0"
          )
        h3.text-success
          icon.fa-fw(name="check")
          |  {{ $root.lang.uploadCompleted }}
        div.share-link
          span.title {{ $root.lang.downloadLink }}:
          |
          a(:href='shareUrl') {{ shareUrl }}
      .row.overall-process(v-show="state === 'uploading'")
        .col-xs-12
          icon.pull-left(name="spinner", scale="2", spin="", style="margin-right: 10px")
          .progress
            .progress-bar.progress-bar-success.progress-bar-striped.active(:style="{width: percentUploaded+'%'}")
              span(v-show='percentUploaded>8') {{ percentUploaded }}%
              span(v-show='percentUploaded>15' style="margin-left: 10px") ({{ humanFileSize(bytesUploaded) }} / {{ humanFileSize(bucketSize) }})
      .row
        .col-sm-7
          files
        .col-sm-5
          settings
          p.text-muted.small.upload-quota(v-if="state === 'new' && user && (limits.transfer || limits.storage)")
            template(v-if="limits.transfer") {{ $root.lang.quota.perTransfer }} {{ humanFileSize(limits.transfer) }}
            template(v-if="limits.transfer && limits.storage")  · 
            template(v-if="limits.storage") {{ $root.lang.quota.storage }} {{ humanFileSize(usage.storage) }} / {{ humanFileSize(limits.storage) }}
          .text-right(v-show='showUploadBtn')
            button#uploadBtn.btn.btn-lg.btn-success(@click="upload()")
              icon.fa-fw(name="upload")
              |  {{ $root.lang.upload }}
          .text-right(v-show="state === 'uploadError'")
            button#uploadRetryBtn.btn.btn-lg.btn-success(@click="upload()")
              icon.fa-fw(name="upload")
              |  {{ $root.lang.retry }}
</template>

<script type="text/babel">
  import { Encoder, Byte } from "@nuintun/qrcode";
  import { mapState, mapActions } from 'pinia';
  import { useUploadStore } from './Upload/store';

  import Settings from './Upload/Settings.vue';
  import Files from './Upload/Files.vue';
  import Clipboard from './common/Clipboard.vue'
  import { humanFileSize } from './common/format';


  export default {
    name: 'Upload',
    components: {
      Settings,
      Files,
      Clipboard,
    },

    data() {
      return {}
    },

    computed: {
      ...mapState(useUploadStore, ['state', 'sid', 'files', 'password', 'disabled', 'percentUploaded', 'shareUrl',
        'bucketSize', 'bytesUploaded', 'config']),
      ...mapState(useUploadStore, { error: 'uploadError' }),
      loginRequired() { return this.config.loginRequired; },
      maintenance() { return this.config.maintenance; },
      maintenanceMessage() { return this.config.maintenanceMessage; },
      registrationMode() { return this.config.registrationMode; },
      user() { return this.config.user; },
      limits() { return this.config.limits; },
      usage() { return this.config.usage; },
      requireBucketPassword() { return this.config.requireBucketPassword; },
      disableQrCode() { return this.config.disableQrCode; },
      mailLnk() {
        return this.config.mailTemplate && this.config.mailTemplate.replace('%%URL%%', this.shareUrl);
      },
      showLogin() {
        return this.loginRequired;
      },
      showUploadBtn() {
        // a refused file (too large, blocked type) has to be removed first
        return this.files.length
          && !this.files.some(f => f.error)
          && !this.disabled
          && (this.requireBucketPassword && this.password || !this.requireBucketPassword)
      }
    },

    watch: {
      state: function(val) {
        if (val === 'uploaded' || val === 'uploadError') {
          const el = document.getElementById('uploadApp');
          if (!el || !el.scrollIntoView) return;
          el.scrollIntoView(true);
        }
      }
    },

    methods: {
      ...mapActions(useUploadStore, ['upload']),
      newSession() {
        if (!confirm(this.$root.lang.createNewUploadSession)) return;
        document.location.reload();
      },
      showQrCode() {
        const qrcode = new Encoder({level: 'H'}).encode(new Byte(this.shareUrl));
        const imgSrc = qrcode.toDataURL(7, 10);
        const data = imgSrc.slice(imgSrc.indexOf(',') + 1);
        const byteCharacters = atob(data);
        const byteNumbers = new Array(byteCharacters.length);
        for (let i = 0; i < byteCharacters.length; i++) {
          byteNumbers[i] = byteCharacters.charCodeAt(i);
        }
        const byteArray = new Uint8Array(byteNumbers);
        const file = new Blob([byteArray], { type: 'image/gif;base64' });
        window.open(URL.createObjectURL(file));
      },
      humanFileSize
    }

  }
</script>

<style>
  @media all and (max-width: 500px) {
    .well {
      padding: 19px 8px;
    }
    .upload-success-btns {
      width: 100%;
      margin-bottom: 10px;
    }

    .upload-success-btns .btn {
      padding: 7px 5px;
      font-size: 12px;
    }
  }
</style>
