<template lang="pug">
  div
    .admin-toolbar
      .grow
        input.form-control(type="search", v-model="q", :placeholder="$t('admin.downloads.search')", @input="debounced")
      a.btn.btn-default(:href="'api/admin/downloads.csv' + filter", download) CSV
    .alert.alert-danger(v-if="error") {{ error }}
    p.text-muted.small {{ $t('admin.downloads.privacy') }}
    table.table.table-condensed.admin-table(v-if="result")
      thead
        tr
          th {{ $t('admin.downloads.at') }}
          th {{ $t('admin.transfers.file') }}
          th {{ $t('admin.transfers.transfer') }}
          th {{ $t('admin.transfers.owner') }}
          th {{ $t('account.ip') }}
          th {{ $t('account.device') }}
          th.text-right {{ $t('admin.transfers.size') }}
      tbody
        tr(v-if="!result.items.length")
          td.text-muted(colspan="7") {{ $t('admin.empty') }}
        tr(v-for="d in result.items", :key="d.id")
          td(style="white-space: nowrap") {{ $date(d.at) }}
          td.break-all {{ d.name }}
          td
            a.mono(v-if="d.available", :href="'admin#/transfers/' + encodeURIComponent(d.sid)") {{ d.sid }}
            span.mono.text-muted(v-else, :title="$t('admin.downloads.gone')") {{ d.sid }}
          td
            a(v-if="d.ownerId", :href="'admin#/users/' + d.ownerId") {{ d.ownerEmail }}
            span.text-muted(v-else) –
          td {{ d.ip || '–' }}
          td.small.text-muted {{ agent(d.userAgent) }}
          td.text-right {{ $size(d.size) }}
    pager(v-if="result", :page="page", :per-page="result.perPage", :total="result.total", @change="p => { page = p; load(); }")
</template>

<script>
  import Pager from './Pager.vue';
  import { get, query } from '../common/api';
  import { userAgentLabel } from '../common/format';

  export default {
    name: 'Downloads',
    components: { Pager },
    data() {
      return { q: '', page: 1, result: null, error: '', timer: null };
    },
    computed: {
      filter() {
        return query({ q: this.q });
      },
    },
    created() {
      this.load();
    },
    methods: {
      agent: userAgentLabel,
      async load() {
        try {
          this.result = await get('admin/downloads' + query({ q: this.q, page: this.page, perPage: 50 }));
        } catch (e) {
          this.error = this.$err(e);
        }
      },
      debounced() {
        clearTimeout(this.timer);
        this.timer = setTimeout(() => {
          this.page = 1;
          this.load();
        }, 300);
      },
    },
  };
</script>
