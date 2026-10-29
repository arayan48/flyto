<template lang="pug">
  div
    .admin-toolbar
      .grow
        input.form-control(type="search", v-model="q", :placeholder="$t('admin.transfers.search')", @input="debounced")
      select.form-control(v-model="status", @change="reload")
        option(value="") {{ $t('admin.transfers.allStatuses') }}
        option(v-for="s in statuses", :value="s") {{ $t('admin.transfers.status.' + s) }}
      select.form-control(v-model="sort", @change="reload")
        option(v-for="s in sorts", :value="s") {{ $t('admin.transfers.sort.' + s) }}
      button.btn.btn-default(@click="dir = dir === 'asc' ? 'desc' : 'asc'; load()") {{ dir === 'asc' ? '▲' : '▼' }}
      a.btn.btn-default(:href="'api/admin/transfers.csv' + filterQuery", download) CSV

    .alert.alert-danger(v-if="error") {{ error }}
    .alert.alert-success(v-if="message") {{ message }}

    .admin-toolbar(v-if="selected.length")
      strong {{ $t('admin.transfers.selected', { count: selected.length }) }}
      button.btn.btn-sm.btn-warning(@click="bulk('suspend')") {{ $t('admin.transfers.suspend') }}
      button.btn.btn-sm.btn-default(@click="bulk('unsuspend')") {{ $t('admin.transfers.unsuspend') }}
      button.btn.btn-sm.btn-danger(@click="bulk('delete')") {{ $t('admin.transfers.delete') }}

    p.text-muted.small(v-if="result") {{ $t('admin.transfers.summary', { count: result.total, size: $size(result.size) }) }}
    transfer-table(v-if="result", :items="result.items", selectable, :selected="selected", @select="s => selected = s")
    pager(v-if="result", :page="page", :per-page="result.perPage", :total="result.total", @change="p => { page = p; load(); }")
</template>

<script>
  import TransferTable from './TransferTable.vue';
  import Pager from './Pager.vue';
  import { get, post, query } from '../common/api';

  export default {
    name: 'Transfers',
    components: { TransferTable, Pager },
    data() {
      return {
        q: '', status: '', sort: 'created', dir: 'desc', page: 1, result: null, error: '', message: '', selected: [],
        statuses: ['active', 'protected', 'oneTime', 'expiringSoon', 'partial', 'suspended', 'anonymous'],
        sorts: ['created', 'size', 'expires', 'downloads', 'files', 'lastDownload'],
        timer: null,
      };
    },
    computed: {
      filterQuery() {
        // the "protected" filter is called password on the server
        return query({ q: this.q, status: this.status === 'protected' ? 'password' : this.status, sort: this.sort,
          dir: this.dir });
      },
    },
    created() {
      this.load();
    },
    methods: {
      async load() {
        this.error = '';
        try {
          const params = this.filterQuery ? this.filterQuery + '&page=' + this.page : '?page=' + this.page;
          this.result = await get('admin/transfers' + params);
        } catch (e) {
          this.error = this.$err(e);
        }
      },
      reload() {
        this.page = 1;
        this.selected = [];
        this.load();
      },
      debounced() {
        clearTimeout(this.timer);
        this.timer = setTimeout(() => this.reload(), 300);
      },
      async bulk(action) {
        let reason;
        if (action === 'delete' && !confirm(this.$t('admin.transfers.confirmBulkDelete', { count: this.selected.length }))) return;
        if (action === 'suspend') {
          reason = prompt(this.$t('admin.transfers.reasonPrompt'));
          if (reason === null) return;
        }
        try {
          const res = await post('admin/transfers/bulk', { sids: this.selected, action, reason });
          this.message = this.$t('admin.transfers.bulkDone', { count: res.done });
          this.selected = [];
          await this.load();
        } catch (e) {
          this.error = this.$err(e);
        }
      },
    },
  };
</script>
