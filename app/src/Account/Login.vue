<template lang="pug">
  .auth-box
    .alert.alert-warning(v-if="setupRequired")
      | {{ $t('auth.setupRequired') }}
      |
      a(href="setup") {{ $t('auth.setupLink') }}
    form.well(@submit.prevent="submit")
      h3 {{ mfa ? $t('auth.twoFactorTitle') : $t('auth.loginTitle') }}
      .alert.alert-danger(v-if="error")
        | {{ error }}
        template(v-if="unverified")
          br
          a(href="#", @click.prevent="resend") {{ $t('auth.resendVerification') }}
      .alert.alert-success(v-if="info") {{ info }}
      template(v-if="!mfa")
        .form-group
          label(for="email") {{ $t('auth.email') }}
          input#email.form-control(type="email", v-model.trim="email", autocomplete="username", required, autofocus)
        .form-group
          label(for="password") {{ $t('auth.password') }}
          input#password.form-control(type="password", v-model="password", autocomplete="current-password", required)
        .checkbox
          label
            input(type="checkbox", v-model="remember")
            |  {{ $t('auth.remember') }}
      template(v-else)
        p.text-muted {{ $t('auth.twoFactorHelp') }}
        .form-group
          input.form-control.totp-input(type="text", v-model.trim="code", autocomplete="one-time-code",
            inputmode="numeric", maxlength="11", required, autofocus, ref="code")
      button.btn.btn-primary(type="submit", :disabled="busy")
        icon.fa-fw(name="sign-in-alt")
        |  {{ $t('auth.loginButton') }}
      .auth-links
        a(href="forgot") {{ $t('auth.forgotLink') }}
        a(href="register", v-if="registrationOpen") {{ $t('auth.registerLink') }}
</template>

<script>
  import 'vue-awesome/icons/sign-in-alt';
  import { post, setCsrf } from '../common/api';

  export default {
    name: 'Login',
    data() {
      return { email: '', password: '', code: '', remember: true, mfa: false, error: '', info: '', busy: false,
        unverified: false };
    },
    computed: {
      registrationOpen() {
        return this.$root.session.settings.registrationMode === 'open';
      },
      setupRequired() {
        return this.$root.session.setupRequired;
      },
    },
    methods: {
      async submit() {
        this.busy = true;
        this.error = '';
        this.info = '';
        this.unverified = false;
        try {
          const res = await post('auth/login', { email: this.email, password: this.password, code: this.code || undefined,
            remember: this.remember });
          if (res.mfaRequired) {
            this.mfa = true;
            this.$nextTick(() => this.$refs.code && this.$refs.code.focus());
            return;
          }
          setCsrf(res.csrf);
          this.$root.goNext(res.user.role === 'admin' ? 'admin' : './');
        } catch (e) {
          this.error = this.$err(e);
          this.unverified = e.code === 'emailNotVerified';
          if (e.code === 'invalidCode') this.code = '';
        } finally {
          this.busy = false;
        }
      },
      async resend() {
        try {
          await post('auth/resend-verification', { email: this.email });
          this.error = '';
          this.info = this.$t('auth.verificationResent');
        } catch (e) {
          this.error = this.$err(e);
        }
      },
    },
  };
</script>
