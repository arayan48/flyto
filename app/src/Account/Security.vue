<template lang="pug">
  .split
    section.card.card-body
      h2.text-lg.mb-4 {{ $t('account.changePassword') }}
      form.form-stack(@submit.prevent="changePassword")
        .alert.alert-success(v-if="pwSaved", role="status") {{ pwSaved }}
        .alert.alert-danger(v-if="pwError", role="alert") {{ pwError }}
        .field(v-if="me.user.hasPassword")
          label.label(for="current") {{ $t('account.currentPassword') }}
          input#current.input(type="password", v-model="current", autocomplete="current-password", required)
        .field
          label.label(for="new") {{ $t('auth.newPassword') }}
          input#new.input(type="password", v-model="password", autocomplete="new-password", required)
          p.hint {{ $t('auth.passwordHint', { min: $root.session.settings.passwordMinLength }) }}
        .field
          label.label(for="new2") {{ $t('auth.passwordRepeat') }}
          input#new2.input(type="password", v-model="password2", autocomplete="new-password", required)
        div
          button.btn.btn-primary(type="submit", :disabled="busy") {{ $t('account.changePassword') }}

    section.card.card-body
      .flex.items-center.justify-between.gap-3.mb-4
        h2.text-lg {{ $t('account.twoFactor') }}
        span.badge.badge-success(v-if="me.user.totpEnabled && !codes") {{ $t('account.enabled') }}
      .alert.alert-danger.mb-4(v-if="error", role="alert") {{ error }}

      .form-stack(v-if="codes")
        .alert.alert-warning {{ $t('account.recoveryCodesHelp') }}
        ol.recovery-codes
          li(v-for="c in codes", :key="c") {{ c }}
        .flex.flex-wrap.gap-2
          button.btn(type="button", @click="downloadCodes") {{ $t('account.downloadCodes') }}
          button.btn.btn-primary(type="button", @click="codes = null") {{ $t('account.codesSaved') }}

      template(v-else-if="me.user.totpEnabled")
        p.muted.mb-4 {{ $t('account.recoveryLeft', { count: me.user.recoveryCodesLeft }) }}
        form.form-stack(@submit.prevent="disable")
          .field
            label.label(for="tfaPassword") {{ $t('auth.password') }}
            input#tfaPassword.input(type="password", v-model="confirmPassword", autocomplete="current-password", required)
          .field
            label.label(for="tfaCode") {{ $t('account.codeOrRecovery') }}
            input#tfaCode.input.input-mono(type="text", v-model.trim="code", autocomplete="one-time-code")
          .flex.flex-wrap.gap-2
            button.btn.btn-danger(type="submit", :disabled="busy") {{ $t('account.disable2fa') }}
            button.btn(type="button", @click="regenerate", :disabled="busy") {{ $t('account.newCodes') }}

      .form-stack(v-else-if="setup")
        p {{ $t('account.scanQr') }}
        img.totp-qr(:src="qr", alt="QR code", width="200", height="200")
        p.text-sm.muted
          | {{ $t('account.manualKey') }}
          code.mono.block.mt-1.select-all {{ setup.secret }}
        form.flex.flex-wrap.gap-2(@submit.prevent="enable")
          input.input.totp-input(type="text", v-model.trim="code", inputmode="numeric", maxlength="6",
            autocomplete="one-time-code", required, placeholder="000000", :aria-label="$t('account.codeOrRecovery')")
          button.btn.btn-primary(type="submit", :disabled="busy") {{ $t('account.enable2fa') }}

      template(v-else)
        p.muted.mb-4 {{ $t('account.twoFactorHelp') }}
        .alert.alert-warning.mb-4(v-if="me.user.role === 'admin' && $root.session.settings.require2faForAdmins") {{ $t('errors.twoFactorRequired') }}
        form.form-stack(@submit.prevent="startSetup")
          .field
            label.label(for="tfaSetupPassword") {{ $t('auth.password') }}
            input#tfaSetupPassword.input(type="password", v-model="confirmPassword", autocomplete="current-password", required)
          div
            button.btn.btn-primary(type="submit", :disabled="busy") {{ $t('account.setup2fa') }}
</template>

<script>
  import { Encoder, Byte } from '@nuintun/qrcode';
  import { post } from '../common/api';

  export default {
    name: 'Security',
    emits: ['changed'],
    props: ['me'],
    data() {
      return { current: '', password: '', password2: '', pwSaved: '', pwError: '', busy: false,
        confirmPassword: '', code: '', setup: null, codes: null, error: '' };
    },
    computed: {
      qr() {
        if (!this.setup) return '';
        return new Encoder({ level: 'M' }).encode(new Byte(this.setup.otpauth)).toDataURL(5, 10);
      },
    },
    methods: {
      async run(fn) {
        this.busy = true;
        this.error = '';
        try {
          await fn();
        } catch (e) {
          this.error = this.$err(e);
        } finally {
          this.busy = false;
        }
      },
      async changePassword() {
        this.pwSaved = '';
        this.pwError = '';
        if (this.password !== this.password2) {
          this.pwError = this.$t('auth.passwordMismatch');
          return;
        }
        this.busy = true;
        try {
          const res = await post('me/password', { currentPassword: this.current, password: this.password });
          this.pwSaved = this.$t('account.passwordChanged', { count: res.sessionsRevoked });
          this.current = this.password = this.password2 = '';
        } catch (e) {
          this.pwError = this.$err(e);
        } finally {
          this.busy = false;
        }
      },
      startSetup() {
        return this.run(async () => {
          this.setup = await post('me/2fa/setup', { password: this.confirmPassword });
          this.confirmPassword = '';
        });
      },
      enable() {
        return this.run(async () => {
          const res = await post('me/2fa/enable', { code: this.code });
          this.codes = res.recoveryCodes;
          this.setup = null;
          this.code = '';
          this.$emit('changed');
        });
      },
      disable() {
        if (!confirm(this.$t('account.confirmDisable2fa'))) return;
        return this.run(async () => {
          await post('me/2fa/disable', { password: this.confirmPassword, code: this.code });
          this.confirmPassword = this.code = '';
          this.$emit('changed');
        });
      },
      regenerate() {
        return this.run(async () => {
          const res = await post('me/2fa/recovery-codes', { password: this.confirmPassword });
          this.codes = res.recoveryCodes;
          this.confirmPassword = '';
          this.$emit('changed');
        });
      },
      downloadCodes() {
        const blob = new Blob([this.codes.join('\n') + '\n'], { type: 'text/plain' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'flyto-recovery-codes.txt';
        a.click();
        URL.revokeObjectURL(a.href);
      },
    },
  };
</script>
