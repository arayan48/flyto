<template lang="pug">
  .auth-box
    .card.card-body.auth-card(v-if="!$root.session.setupRequired")
      h1.auth-title {{ $t('auth.setupTitle') }}
      p {{ $t('auth.setupDone') }}
      a.btn.btn-primary(href="login") {{ $t('auth.loginButton') }}
    form.card.card-body.auth-card(v-else, @submit.prevent="submit")
      h1.auth-title {{ $t('auth.setupTitle') }}
      p.muted {{ $t('auth.setupHelp') }}
      .alert.alert-danger(v-if="error", role="alert") {{ error }}
      .field
        label.label(for="token") {{ $t('auth.setupCode') }}
        input#token.input(type="text", v-model.trim="token", placeholder="XXXX-XXXX-XXXX-XXXX", required,
          autocomplete="off", autofocus)
        p.hint {{ $t('auth.setupCodeHelp') }}
      .field
        label.label(for="name") {{ $t('auth.name') }}
        input#name.input(type="text", v-model.trim="name", autocomplete="name")
      .field
        label.label(for="email") {{ $t('auth.email') }}
        input#email.input(type="email", v-model.trim="email", autocomplete="email", required)
      .field
        label.label(for="password") {{ $t('auth.password') }}
        input#password.input(type="password", v-model="password", autocomplete="new-password", required)
        p.hint {{ $t('auth.passwordHint', { min: $root.session.settings.passwordMinLength }) }}
      .field
        label.label(for="password2") {{ $t('auth.passwordRepeat') }}
        input#password2.input(type="password", v-model="password2", autocomplete="new-password", required)
      button.btn.btn-primary(type="submit", :disabled="busy") {{ $t('auth.setupButton') }}
</template>

<script>
  import { post, setCsrf } from '../common/api';

  export default {
    name: 'Setup',
    data() {
      return { token: '', name: '', email: '', password: '', password2: '', error: '', busy: false };
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
          const res = await post('setup', { token: this.token, name: this.name, email: this.email, password: this.password });
          setCsrf(res.csrf);
          document.location.href = 'admin';
        } catch (e) {
          this.error = this.$err(e);
        } finally {
          this.busy = false;
        }
      },
    },
  };
</script>
