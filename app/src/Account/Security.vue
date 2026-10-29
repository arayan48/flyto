<template lang="pug">
  .row
    .col-md-6
      h4 {{ $t('account.changePassword') }}
      form(@submit.prevent="changePassword")
        .alert.alert-success(v-if="pwSaved") {{ pwSaved }}
        .alert.alert-danger(v-if="pwError") {{ pwError }}
        .form-group(v-if="me.user.hasPassword")
          label(for="current") {{ $t('account.currentPassword') }}
          input#current.form-control(type="password", v-model="current", autocomplete="current-password", required)
        .form-group
          label(for="new") {{ $t('auth.newPassword') }}
          input#new.form-control(type="password", v-model="password", autocomplete="new-password", required)
          p.help-block {{ $t('auth.passwordHint', { min: $root.session.settings.passwordMinLength }) }}
        .form-group
          label(for="new2") {{ $t('auth.passwordRepeat') }}
          input#new2.form-control(type="password", v-model="password2", autocomplete="new-password", required)
        button.btn.btn-primary(type="submit", :disabled="busy") {{ $t('account.changePassword') }}
    .col-md-6
      h4 {{ $t('account.twoFactor') }}
      .alert.alert-danger(v-if="error") {{ error }}

      template(v-if="codes")
        .alert.alert-warning {{ $t('account.recoveryCodesHelp') }}
        .recovery-codes
          div(v-for="c in codes") {{ c }}
        p(style="margin-top: 10px")
          button.btn.btn-default.btn-sm(@click="downloadCodes") {{ $t('account.downloadCodes') }}
          |
          button.btn.btn-primary.btn-sm(@click="codes = null") {{ $t('account.codesSaved') }}

      template(v-else-if="me.user.totpEnabled")
        p
          span.label.label-success {{ $t('account.enabled') }}
          |  {{ $t('account.recoveryLeft', { count: me.user.recoveryCodesLeft }) }}
        form(@submit.prevent="disable")
          .form-group
            label {{ $t('auth.password') }}
            input.form-control(type="password", v-model="confirmPassword", autocomplete="current-password", required)
          .form-group
            label {{ $t('account.codeOrRecovery') }}
            input.form-control(type="text", v-model.trim="code", autocomplete="one-time-code")
          button.btn.btn-danger(type="submit", :disabled="busy") {{ $t('account.disable2fa') }}
          |
          button.btn.btn-default(type="button", @click="regenerate", :disabled="busy") {{ $t('account.newCodes') }}

      template(v-else-if="setup")
        p {{ $t('account.scanQr') }}
        p
          img(:src="qr", alt="QR code", width="220", height="220")
        p.small.text-muted
          | {{ $t('account.manualKey') }}
          br
          code {{ setup.secret }}
        form.form-inline(@submit.prevent="enable")
          input.form-control.totp-input(type="text", v-model.trim="code", inputmode="numeric", maxlength="6",
            autocomplete="one-time-code", required, placeholder="000000", style="width: 160px")
          |
          button.btn.btn-primary(type="submit", :disabled="busy") {{ $t('account.enable2fa') }}

      template(v-else)
        p.text-muted {{ $t('account.twoFactorHelp') }}
        .alert.alert-warning(v-if="me.user.role === 'admin' && $root.session.settings.require2faForAdmins") {{ $t('errors.twoFactorRequired') }}
        form(@submit.prevent="startSetup")
          .form-group
            label {{ $t('auth.password') }}
            input.form-control(type="password", v-model="confirmPassword", autocomplete="current-password", required)
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
