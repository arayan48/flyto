<template lang="pug">
  .auth-box
    .card.card-body.auth-card
      h1.auth-title {{ $t('auth.verifyTitle') }}
      p(v-if="state === 'pending'")
        icon(name="spinner", spin)
      template(v-else-if="state === 'ok'")
        p.text-success.mb-4 {{ $t('auth.verifyDone', { email }) }}
        a.btn.btn-primary(:href="$root.session.user ? 'account' : 'login'") {{ $t('auth.continue') }}
      template(v-else)
        .alert.alert-danger {{ $t('errors.invalidToken') }}
        a.btn(href="login") {{ $t('auth.loginButton') }}
</template>

<script>
  import { post } from '../common/api';

  export default {
    name: 'Verify',
    data() {
      return { state: 'pending', email: '' };
    },
    // the link only opens the page, the POST confirms: mail scanners following links do not
    async mounted() {
      const parts = document.location.pathname.split('/').filter(Boolean);
      try {
        const res = await post('auth/verify', { token: decodeURIComponent(parts[parts.length - 1] || '') });
        this.email = res.email;
        this.state = 'ok';
      } catch (e) {
        this.state = 'error';
      }
    },
  };
</script>
