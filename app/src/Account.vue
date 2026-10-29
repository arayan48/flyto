<template lang="pug">
  .account-app
    .alert.alert-danger(v-if="$root.error") {{ $root.error }}
    template(v-else-if="$root.session && $root.lang.auth")
      login(v-if="page === 'login'")
      register(v-else-if="page === 'register'")
      forgot(v-else-if="page === 'forgot'")
      reset(v-else-if="page === 'reset'")
      verify(v-else-if="page === 'verify'")
      setup(v-else-if="page === 'setup'")
      my-account(v-else-if="page === 'account'")
    p.text-muted(v-else)
      icon(name="spinner", spin="")
</template>

<script>
  import Login from './Account/Login.vue';
  import Register from './Account/Register.vue';
  import Forgot from './Account/Forgot.vue';
  import Reset from './Account/Reset.vue';
  import Verify from './Account/Verify.vue';
  import Setup from './Account/Setup.vue';
  import MyAccount from './Account/MyAccount.vue';

  export default {
    name: 'Account',
    components: { Login, Register, Forgot, Reset, Verify, Setup, MyAccount },
    computed: {
      page() {
        return this.$root.page;
      }
    },
  };
</script>

<style>
  .auth-box {
    max-width: 440px;
    margin: 20px auto 40px;
  }
  .auth-box h3 {
    margin-top: 0;
  }
  .auth-links {
    margin-top: 15px;
  }
  .auth-links a + a {
    margin-left: 12px;
  }
  .totp-input {
    font-size: 22px;
    letter-spacing: 0.3em;
    text-align: center;
  }
  .recovery-codes {
    columns: 2;
    font-family: Menlo, Consolas, monospace;
    font-size: 15px;
    padding: 12px 16px;
    background: #f6f8fc;
    border: 1px solid #e3e7ef;
    border-radius: 4px;
  }
  .table-actions {
    white-space: nowrap;
    text-align: right;
  }
  .table-actions .btn + .btn {
    margin-left: 4px;
  }
  .usage-bar {
    height: 8px;
    margin: 6px 0 4px;
  }
  .nav-tabs {
    margin-bottom: 20px;
  }
</style>
