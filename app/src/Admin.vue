<template lang="pug">
  .admin-app
    .alert.alert-danger(v-if="$root.error") {{ $root.error }}
    template(v-else-if="$root.session && $root.lang.admin")
      ul.nav.nav-tabs.admin-tabs
        li(v-for="t in tabs", :class="{active: route.tab === t}")
          a(:href="'admin#/' + t") {{ $t('admin.tabs.' + t) }}
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
    p.text-muted(v-else)
      icon(name="spinner", spin="")
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
      return { tabs: TABS, route: parseRoute() };
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
  .admin-tabs {
    margin-bottom: 20px;
  }
  .admin-toolbar {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    align-items: center;
    margin-bottom: 15px;
  }
  .admin-toolbar .form-control {
    width: auto;
    display: inline-block;
  }
  .admin-toolbar .grow {
    flex: 1 1 220px;
  }
  .admin-toolbar .grow .form-control {
    width: 100%;
  }
  .stat-tile {
    background: #fff;
    border: 1px solid #e3e7ef;
    border-radius: 6px;
    padding: 14px 16px;
    margin-bottom: 20px;
  }
  .stat-tile .stat-label {
    color: #5b6475;
    font-size: 13px;
  }
  .stat-tile .stat-value {
    font-size: 26px;
    letter-spacing: -0.02em;
    line-height: 1.3;
  }
  .stat-tile .stat-sub {
    color: #5b6475;
    font-size: 12px;
  }
  .admin-table td, .admin-table th {
    vertical-align: middle !important;
  }
  .admin-table tr.clickable {
    cursor: pointer;
  }
  .table-actions {
    white-space: nowrap;
    text-align: right;
  }
  .table-actions .btn + .btn {
    margin-left: 4px;
  }
  .admin-section {
    margin-bottom: 30px;
  }
  .admin-section h4 {
    margin-bottom: 12px;
  }
  .kv-table th {
    width: 40%;
    font-weight: 400;
    color: #5b6475;
  }
  .label + .label {
    margin-left: 3px;
  }
  .usage-bar {
    height: 8px;
    margin: 6px 0 4px;
  }
  .mono {
    font-family: Menlo, Consolas, monospace;
    font-size: 12px;
  }
  .break-all {
    word-break: break-all;
  }
</style>
