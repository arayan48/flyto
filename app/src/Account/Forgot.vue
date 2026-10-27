<template lang="pug">
  .auth-box
    .well(v-if="sent")
      h3 {{ $t('auth.forgotTitle') }}
      p(v-if="mail") {{ $t('auth.forgotSent') }}
      p(v-else) {{ $t('auth.forgotNoMail') }}
      a.btn.btn-default(href="login") {{ $t('auth.loginButton') }}
    form.well(v-else, @submit.prevent="submit")
      h3 {{ $t('auth.forgotTitle') }}
      p.text-muted {{ $t('auth.forgotHelp') }}
      .alert.alert-danger(v-if="error") {{ error }}
      .form-group
        label(for="email") {{ $t('auth.email') }}
        input#email.form-control(type="email", v-model.trim="email", autocomplete="email", required, autofocus)
      button.btn.btn-primary(type="submit", :disabled="busy") {{ $t('auth.forgotButton') }}
      .auth-links
        a(href="login") {{ $t('auth.backToLogin') }}
</template>

<script>
  import { post } from '../common/api';

  export default {
    name: 'Forgot',
    data() {
      return { email: '', error: '', busy: false, sent: false, mail: true };
    },
    methods: {
      async submit() {
        this.busy = true;
        this.error = '';
        try {
          const res = await post('auth/forgot', { email: this.email });
          this.mail = res.mail;
          this.sent = true;
        } catch (e) {
          this.error = this.$err(e);
        } finally {
          this.busy = false;
        }
      },
    },
  };
</script>
