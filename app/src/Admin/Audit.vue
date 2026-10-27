<template lang="pug">
  div
    .admin-toolbar
      .grow
        input.form-control(type="search", v-model="q", :placeholder="$t('admin.audit.search')", @input="debounced")
      select.form-control(v-model="action", @change="reload")
        option(value="") {{ $t('admin.audit.allActions') }}
        option(value="auth.") {{ $t('admin.audit.groups.auth') }}
        option(value="user.") {{ $t('admin.audit.groups.user') }}
        option(value="admin.") {{ $t('admin.audit.groups.admin') }}
        option(value="transfer.") {{ $t('admin.audit.groups.transfer') }}
        option(v-for="a in actions", :value="a", :key="a") {{ label(a) }}
      a.btn.btn-default(:href="'api/admin/audit.csv' + filter", download) CSV
    .alert.alert-danger(v-if="error") {{ error }}
    template(v-if="result")
      audit-table(:items="result.items")
      pager(:page="page", :per-page="result.perPage", :total="result.total", @change="p => { page = p; load(); }")
</template>

<script>
  import AuditTable from './AuditTable.vue';
  import Pager from './Pager.vue';
  import { get, query } from '../common/api';

  export default {
    name: 'Audit',
    components: { AuditTable, Pager },
    data() {
      return { q: '', action: '', page: 1, result: null, actions: [], error: '', timer: null };
    },
    computed: {
      filter() {
        return query({ q: this.q, action: this.action });
      },
    },
    created() {
      this.load();
    },
    methods: {
      label(action) {
        return (this.$root.lang.admin.actions || {})[action] || action;
      },
      async load() {
        try {
          this.result = await get('admin/audit' + query({ q: this.q, action: this.action, page: this.page, perPage: 50 }));
          this.actions = this.result.actions;
        } catch (e) {
          this.error = this.$err(e);
        }
      },
      reload() {
        this.page = 1;
        this.load();
      },
      debounced() {
        clearTimeout(this.timer);
        this.timer = setTimeout(() => this.reload(), 300);
      },
    },
  };
</script>
