<template lang="pug">
  .my-account
    header.mb-6
      h1.text-2xl {{ $t('account.title') }}
      p.muted.mt-1(v-if="me") {{ me.user.email }}
    nav.tabs.mb-6(:aria-label="$t('account.title')")
      a(v-for="t in tabs", :key="t", :href="'account#' + t", :aria-current="tab === t ? 'page' : null") {{ $t('account.tabs.' + t) }}
    .alert.alert-danger.mb-4(v-if="error", role="alert") {{ error }}
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
