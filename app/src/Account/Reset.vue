<template lang="pug">
  .auth-box
    .card.card-body.auth-card(v-if="done")
      h1.auth-title.text-success {{ $t('auth.resetDone') }}
      a.btn.btn-primary(href="login") {{ $t('auth.loginButton') }}
    .card.card-body.auth-card(v-else-if="invalid")
      h1.auth-title {{ $t('auth.resetTitle') }}
      .alert.alert-danger {{ $t('errors.invalidToken') }}
      a.btn(href="forgot") {{ $t('auth.forgotLink') }}
    form.card.card-body.auth-card(v-else, @submit.prevent="submit")
      h1.auth-title {{ $t('auth.resetTitle') }}
      p.muted(v-if="email") {{ email }}
      .alert.alert-danger(v-if="error", role="alert") {{ error }}
      .field
        label.label(for="password") {{ $t('auth.newPassword') }}
        input#password.input(type="password", v-model="password", autocomplete="new-password", required, autofocus)
        p.hint {{ $t('auth.passwordHint', { min: $root.session.settings.passwordMinLength }) }}
      .field
        label.label(for="password2") {{ $t('auth.passwordRepeat') }}
        input#password2.input(type="password", v-model="password2", autocomplete="new-password", required)
      button.btn.btn-primary(type="submit", :disabled="busy") {{ $t('auth.resetButton') }}
</template>

<script>
  import { get, post } from '../common/api';

  function tokenFromPath() {
    const parts = document.location.pathname.split('/').filter(Boolean);
    return decodeURIComponent(parts[parts.length - 1] || '');
  }

  export default {
    name: 'Reset',
    data() {
      return { token: tokenFromPath(), email: '', password: '', password2: '', error: '', busy: false, done: false,
        invalid: false };
    },
    async created() {
      try {
        this.email = (await get('auth/reset/' + encodeURIComponent(this.token))).email;
      } catch (e) {
        this.invalid = true;
      }
    },
    methods: {
      async submit() {
        this.error = '';
        if (this.password !== this.password2) {
          this.error = this.$t('auth.passwordMismatch');
          return;
        }
        this.busy = true;
        try {
          await post('auth/reset', { token: this.token, password: this.password });
          this.done = true;
        } catch (e) {
          if (e.code === 'invalidToken') this.invalid = true;
          this.error = this.$err(e);
        } finally {
          this.busy = false;
        }
      },
    },
  };
</script>
