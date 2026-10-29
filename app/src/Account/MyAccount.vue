<template lang="pug">
  .my-account
    h3 {{ $t('account.title') }}
      small(v-if="me")  {{ me.user.email }}
    ul.nav.nav-tabs
      li(v-for="t in tabs", :class="{active: tab === t}")
        a(:href="'account#' + t") {{ $t('account.tabs.' + t) }}
    .alert.alert-danger(v-if="error") {{ error }}
    template(v-if="me")
      my-transfers(v-if="tab === 'transfers'", :me="me", @changed="load")
      profile(v-else-if="tab === 'profile'", :me="me", @changed="load")
      security(v-else-if="tab === 'security'", :me="me", @changed="load")
      sessions(v-else-if="tab === 'sessions'")
      personal-data(v-else-if="tab === 'data'", :me="me")
</template>

<script>
  import { get } from '../common/api';
  import MyTransfers from './MyTransfers.vue';
  import Profile from './Profile.vue';
  import Security from './Security.vue';
  import Sessions from './Sessions.vue';
  import PersonalData from './PersonalData.vue';

  const TABS = ['transfers', 'profile', 'security', 'sessions', 'data'];

  function tabFromHash() {
    const hash = document.location.hash.replace('#', '');
    return TABS.includes(hash) ? hash : 'transfers';
  }

  export default {
    name: 'MyAccount',
    components: { MyTransfers, Profile, Security, Sessions, PersonalData },
    data() {
      return { tabs: TABS, tab: tabFromHash(), me: null, error: '' };
    },
    created() {
      this.load();
      window.addEventListener('hashchange', () => {
        this.tab = tabFromHash();
      });
    },
    methods: {
      async load() {
        try {
          this.me = await get('me');
        } catch (e) {
          if (e.status === 401) document.location.href = 'login?next=account';
          this.error = this.$err(e);
        }
      },
    },
  };
</script>
