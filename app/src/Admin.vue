<template lang="pug">
  .admin-app
    .alert.alert-danger(v-if="$root.error", role="alert") {{ $root.error }}
    template(v-else-if="$root.session && $root.lang.admin")
      h1.title.mb-8.rise(v-html="$rich('ui.admin.title')")
      .admin-layout
        nav.admin-tabs(:aria-label="$root.lang.nav.admin")
          a(v-for="t in tabs", :key="t", :href="'admin#/' + t", :aria-current="route.tab === t ? 'page' : null")
            icon(:name="tabIcons[t]")
            span {{ $t('admin.tabs.' + t) }}
        .admin-content
          dashboard(v-if="route.tab === 'dashboard'")
          users(v-else-if="route.tab === 'users' && !route.id")
          user-detail(v-else-if="route.tab === 'users'", :id="route.id", :key="route.id")
          transfers(v-else-if="route.tab === 'transfers' && !route.id")
          transfer-detail(v-else-if="route.tab === 'transfers'", :sid="route.id", :key="route.id")
          downloads(v-else-if="route.tab === 'downloads'")
          invites(v-else-if="route.tab === 'invites'")
          audit(v-else-if="route.tab === 'audit'")
          settings(v-else-if="route.tab === 'settings'")
          system(v-else-if="route.tab === 'system'")
    p.muted(v-else)
      icon(name="spinner", spin)
</template>

<script>
  import Dashboard from './Admin/Dashboard.vue';
  import Users from './Admin/Users.vue';
  import UserDetail from './Admin/UserDetail.vue';
  import Transfers from './Admin/Transfers.vue';
  import TransferDetail from './Admin/TransferDetail.vue';
  import Downloads from './Admin/Downloads.vue';
  import Invites from './Admin/Invites.vue';
  import Audit from './Admin/Audit.vue';
  import Settings from './Admin/Settings.vue';
  import System from './Admin/System.vue';

  const TABS = ['dashboard', 'users', 'transfers', 'downloads', 'invites', 'audit', 'settings', 'system'];
  const TAB_ICONS = {
    dashboard: 'gauge', users: 'users', transfers: 'stack', downloads: 'download', invites: 'envelope',
    audit: 'list', settings: 'sliders', system: 'cpu',
  };

  // #/users/12 -> { tab: 'users', id: '12' }
  function parseRoute() {
    const parts = document.location.hash.replace(/^#\/?/, '').split('/').map(decodeURIComponent);
    const tab = TABS.includes(parts[0]) ? parts[0] : 'dashboard';
    return { tab, id: parts[1] || null };
  }

  export default {
    name: 'Admin',
    components: { Dashboard, Users, UserDetail, Transfers, TransferDetail, Downloads, Invites, Audit, Settings, System },
    data() {
      return { tabs: TABS, route: parseRoute(), tabIcons: TAB_ICONS };
    },
    created() {
      window.addEventListener('hashchange', () => {
        this.route = parseRoute();
        window.scrollTo(0, 0);
      });
    },
  };
</script>

<style>
  .admin-layout {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: 1.25rem;
  }
  @media (min-width: 52rem) {
    .admin-layout {
      grid-template-columns: 12rem minmax(0, 1fr);
      gap: 2rem;
      align-items: start;
    }
  }
  .admin-tabs {
    display: flex;
    flex-wrap: wrap;
    gap: .25rem;
    padding-bottom: .75rem;
    border-bottom: 1px solid var(--line);
  }
  .admin-tabs a {
    display: flex;
    align-items: center;
    gap: .55rem;
    padding: .5rem .9rem;
    border-radius: var(--radius-full);
    color: var(--ink-2);
    font-size: var(--text-sm);
    font-weight: 600;
    text-decoration: none;
    white-space: nowrap;
  }
  .admin-tabs a:hover {
    background: var(--surface-2);
    color: var(--ink);
  }
  .admin-tabs a[aria-current="page"] {
    background: var(--ink);
    color: var(--bg);
  }
  @media (min-width: 52rem) {
    .admin-tabs {
      position: sticky;
      top: 1.5rem;
      flex-direction: column;
      flex-wrap: nowrap;
      padding: 0;
      border-bottom: 0;
    }
  }
  .admin-toolbar {
    display: flex;
    flex-wrap: wrap;
    gap: .5rem;
    align-items: center;
    margin-bottom: 1rem;
  }
  .admin-toolbar .select, .admin-toolbar .input {
    width: auto;
  }
  .admin-toolbar .grow {
    flex: 1 1 14rem;
  }
  .admin-toolbar .grow .input {
    width: 100%;
  }
  .admin-section {
    margin-top: 2rem;
  }
  .section-title {
    margin-bottom: .75rem;
    font-size: var(--text-base);
  }
  .back-link {
    display: inline-flex;
    align-items: center;
    gap: .3rem;
    margin-bottom: 1rem;
    color: var(--ink-2);
    font-size: var(--text-sm);
    text-decoration: none;
  }
  .kv-card {
    padding: .25rem 1.1rem;
  }
  .kv-table {
    width: 100%;
    font-size: var(--text-sm);
  }
  .kv-table th, .kv-table td {
    padding: .4rem 0;
    border-bottom: 1px solid var(--line);
    vertical-align: top;
  }
  .kv-table tr:last-child th, .kv-table tr:last-child td {
    border-bottom: 0;
  }
  .kv-table th {
    width: 42%;
    padding-right: 1rem;
    color: var(--ink-3);
    font-weight: 400;
    text-align: left;
  }
  .kv-table td {
    overflow-wrap: anywhere;
  }
  .badge + .badge {
    margin-left: .25rem;
  }
  .inline-form {
    display: flex;
    flex-wrap: wrap;
    gap: .5rem;
  }
  .inline-form .input {
    flex: 1 1 12rem;
    width: auto;
  }
  .stack-actions {
    display: grid;
    gap: .5rem;
  }
  .grid-2, .grid-75, .grid-4, .grid-label {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    grid-template-columns: minmax(0, 1fr);
    gap: 1rem 1.25rem;
  }
  @media (min-width: 40rem) {
    .grid-2 {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
    .grid-4 {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
    .grid-label {
      grid-template-columns: 14rem minmax(0, 1fr);
    }
  }
  @media (min-width: 68rem) {
    .grid-4 {
      grid-template-columns: repeat(4, minmax(0, 1fr));
    }
    .grid-75 {
      grid-template-columns: minmax(0, 7fr) minmax(0, 5fr);
      gap: 1.5rem;
    }
  }
  .invites-layout {
    display: grid;
    gap: 1.5rem;
  }
  .invites-layout form {
    max-width: 36rem;
  }
  tr.is-suspended td {
    background: var(--danger-soft);
  }
</style>
