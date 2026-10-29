<template lang="pug">
  .account-app
    .alert.alert-danger(v-if="$root.error") {{ $root.error }}
    my-account(v-else-if="$root.session && $root.lang.auth && page === 'account'")
    template(v-else-if="$root.session && $root.lang.auth")
      section.band.auth-band
        h1.display.rise(v-html="$rich('ui.auth.' + page)")
      .band-lift
        login(v-if="page === 'login'")
        register(v-else-if="page === 'register'")
        forgot(v-else-if="page === 'forgot'")
        reset(v-else-if="page === 'reset'")
        verify(v-else-if="page === 'verify'")
        setup(v-else-if="page === 'setup'")
    p.muted(v-else)
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
  .auth-band {
    padding-bottom: 8rem;
  }
  .auth-box {
    display: grid;
    gap: 1rem;
    max-width: 28rem;
  }
  .auth-card {
    display: grid;
    gap: 1.1rem;
    padding: 2rem;
    border-color: transparent;
    box-shadow: var(--shadow-card);
  }
  .auth-card .btn-primary {
    width: 100%;
  }
  .auth-title {
    font-size: var(--text-xl);
    letter-spacing: -0.03em;
  }
  .auth-links {
    display: flex;
    flex-wrap: wrap;
    justify-content: space-between;
    gap: .5rem 1rem;
    font-size: var(--text-sm);
  }
  .totp-input {
    max-width: 11rem;
    font-family: var(--font-mono);
    font-size: var(--text-lg);
    letter-spacing: .3em;
    text-align: center;
  }
  .totp-qr {
    padding: .5rem;
    border-radius: var(--radius-md);
    background: #fff;
  }
  .recovery-codes {
    columns: 2;
    padding: .9rem 1.1rem;
    border-radius: var(--radius-md);
    background: var(--surface-2);
    font-family: var(--font-mono);
    font-size: var(--text-sm);
    line-height: 1.9;
  }
  .form-stack {
    display: grid;
    gap: 1rem;
    max-width: 32rem;
  }
  .split {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    grid-template-columns: minmax(0, 1fr);
    gap: 1.25rem;
    align-items: start;
  }
  @media (min-width: 52rem) {
    .split {
      grid-template-columns: 1fr 1fr;
    }
  }
  .danger-zone {
    border-color: color-mix(in srgb, var(--danger) 35%, var(--line));
  }
  .usage {
    display: grid;
  }
  @media (min-width: 40rem) {
    .usage {
      grid-template-columns: repeat(3, 1fr);
    }
  }
  .usage-item {
    display: grid;
    align-content: start;
    gap: .15rem;
    padding: 1rem 1.1rem;
  }
  .usage-item + .usage-item {
    border-top: 1px solid var(--line);
  }
  @media (min-width: 40rem) {
    .usage-item + .usage-item {
      border-top: 0;
      border-left: 1px solid var(--line);
    }
  }
  .usage-value {
    font-size: var(--text-lg);
    font-weight: 650;
  }
  .progress.is-high > span {
    background: var(--danger);
  }
  .sub-row td {
    background: var(--surface-2);
  }
</style>
