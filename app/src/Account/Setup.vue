<template lang="pug">
  .auth-box
    .well(v-if="!$root.session.setupRequired")
      h3 {{ $t('auth.setupTitle') }}
      p {{ $t('auth.setupDone') }}
      a.btn.btn-primary(href="login") {{ $t('auth.loginButton') }}
    form.well(v-else, @submit.prevent="submit")
      h3 {{ $t('auth.setupTitle') }}
      p.text-muted {{ $t('auth.setupHelp') }}
      .alert.alert-danger(v-if="error") {{ error }}
      .form-group
        label(for="token") {{ $t('auth.setupCode') }}
        input#token.form-control(type="text", v-model.trim="token", placeholder="XXXX-XXXX-XXXX-XXXX", required,
          autocomplete="off", autofocus)
        p.help-block {{ $t('auth.setupCodeHelp') }}
      .form-group
        label(for="name") {{ $t('auth.name') }}
        input#name.form-control(type="text", v-model.trim="name", autocomplete="name")
      .form-group
        label(for="email") {{ $t('auth.email') }}
        input#email.form-control(type="email", v-model.trim="email", autocomplete="email", required)
      .form-group
        label(for="password") {{ $t('auth.password') }}
        input#password.form-control(type="password", v-model="password", autocomplete="new-password", required)
        p.help-block {{ $t('auth.passwordHint', { min: $root.session.settings.passwordMinLength }) }}
      .form-group
        label(for="password2") {{ $t('auth.passwordRepeat') }}
        input#password2.form-control(type="password", v-model="password2", autocomplete="new-password", required)
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
