<template lang="pug">
  div
    .admin-toolbar
      .grow
        input.form-control(type="search", v-model="q", :placeholder="$t('admin.users.search')", @input="debounced")
      select.form-control(v-model="role", @change="reload")
        option(value="") {{ $t('admin.users.allRoles') }}
        option(value="user") {{ $t('admin.roles.user') }}
        option(value="admin") {{ $t('admin.roles.admin') }}
      select.form-control(v-model="status", @change="reload")
        option(value="") {{ $t('admin.users.allStatuses') }}
        option(v-for="s in statuses", :value="s") {{ $t('admin.users.statusFilter.' + s) }}
      button.btn.btn-primary(@click="showCreate = !showCreate")
        icon.fa-fw(name="user-plus")
        |  {{ $t('admin.users.create') }}
      a.btn.btn-default(href="api/admin/users.csv", download) CSV

    form.well(v-if="showCreate", @submit.prevent="create")
      h4 {{ $t('admin.users.create') }}
      .alert.alert-danger(v-if="createError") {{ createError }}
      .row
        .col-sm-6.form-group
          label {{ $t('auth.email') }}
          input.form-control(type="email", v-model.trim="form.email", required)
        .col-sm-6.form-group
          label {{ $t('auth.name') }}
          input.form-control(type="text", v-model.trim="form.name")
        .col-sm-6.form-group
          label {{ $t('admin.users.role') }}
          select.form-control(v-model="form.role")
            option(value="user") {{ $t('admin.roles.user') }}
            option(value="admin") {{ $t('admin.roles.admin') }}
        .col-sm-6.form-group
          label {{ $t('auth.password') }}
          input.form-control(type="text", v-model="form.password", autocomplete="new-password",
            :placeholder="$t('admin.users.passwordOptional')")
      .checkbox(v-if="!form.password")
        label
          input(type="checkbox", v-model="form.sendEmail")
          |  {{ $t('admin.users.sendWelcome') }}
      button.btn.btn-primary(type="submit", :disabled="busy") {{ $t('admin.users.createButton') }}
      |
      button.btn.btn-default(type="button", @click="showCreate = false") {{ $t('admin.cancel') }}

    .alert.alert-success(v-if="created")
      | {{ $t('admin.users.created', { email: created.user.email }) }}
      template(v-if="created.link")
        br
        | {{ created.mailed ? $t('admin.users.linkMailed') : $t('admin.users.linkToShare') }}
        br
        code.break-all {{ created.link }}
        |
        clipboard.btn.btn-xs.btn-default(:value="created.link")

    .alert.alert-danger(v-if="error") {{ error }}
    table.table.table-hover.admin-table
      thead
        tr
          th(v-for="c in columns", :key="c.key", :class="c.cls", @click="c.sort && sortBy(c.sort)",
            :style="c.sort ? 'cursor: pointer' : ''")
            | {{ c.label }}
            span(v-if="sort === c.sort")  {{ dir === 'asc' ? '▲' : '▼' }}
      tbody
        tr(v-if="result && !result.items.length")
          td.text-muted(:colspan="columns.length") {{ $t('admin.empty') }}
        tr.clickable(v-for="u in items", :key="u.id", @click="open(u)")
          td
            strong {{ u.name || u.email }}
            br(v-if="u.name")
            small.text-muted(v-if="u.name") {{ u.email }}
          td
            span.label(:class="u.role === 'admin' ? 'label-primary' : 'label-default'") {{ $t('admin.roles.' + u.role) }}
            span.label.label-success(v-if="u.totpEnabled") 2FA
          td
            span.label(:class="statusClass(u.status)") {{ $t('admin.users.statuses.' + u.status) }}
            span.label.label-danger(v-if="u.lockedUntil && u.lockedUntil > now") {{ $t('admin.users.locked') }}
            span.label.label-warning(v-if="!u.emailVerified") {{ $t('admin.users.unverified') }}
          td.text-right {{ u.usage ? u.usage.transfers : 0 }}
          td.text-right {{ (u.usage ? u.usage.storage : 0) | size }}
          td {{ u.lastLoginAt | date }}
          td {{ u.createdAt | day }}
    pager(v-if="result", :page="page", :per-page="result.perPage", :total="result.total", @change="p => { page = p; load(); }")
</template>

<script>
  import 'vue-awesome/icons/user-plus';
  import Pager from './Pager.vue';
  import Clipboard from '../common/Clipboard.vue';
  import { get, post, query } from '../common/api';

  export default {
    name: 'Users',
    components: { Pager, Clipboard },
    data() {
      return {
        q: '', role: '', status: '', sort: 'created', dir: 'desc', page: 1, result: null, error: '',
        statuses: ['active', 'pending', 'disabled', 'locked', 'unverified', '2fa'],
        showCreate: false, busy: false, createError: '', created: null,
        form: { email: '', name: '', role: 'user', password: '', sendEmail: true },
        now: Date.now(), timer: null,
      };
    },
    computed: {
      items() {
        return this.result ? this.result.items : [];
      },
      columns() {
        return [
          { key: 'user', label: this.$t('admin.users.user'), sort: 'email' },
          { key: 'role', label: this.$t('admin.users.role'), sort: 'role' },
          { key: 'status', label: this.$t('admin.users.status'), sort: 'status' },
          { key: 'transfers', label: this.$t('admin.users.transfers'), cls: 'text-right' },
          { key: 'storage', label: this.$t('admin.users.storage'), cls: 'text-right' },
          { key: 'lastLogin', label: this.$t('admin.users.lastLogin'), sort: 'lastLogin' },
          { key: 'created', label: this.$t('admin.users.created_'), sort: 'created' },
        ];
      },
    },
    created() {
      this.load();
    },
    methods: {
      async load() {
        this.error = '';
        try {
          this.result = await get('admin/users' + query({ q: this.q, role: this.role, status: this.status,
            sort: this.sort, dir: this.dir, page: this.page }));
          this.now = Date.now();
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
      sortBy(key) {
        if (this.sort === key) this.dir = this.dir === 'asc' ? 'desc' : 'asc';
        else {
          this.sort = key;
          this.dir = key === 'email' || key === 'role' || key === 'status' ? 'asc' : 'desc';
        }
        this.load();
      },
      open(u) {
        document.location.hash = '#/users/' + u.id;
      },
      statusClass(status) {
        return { active: 'label-success', pending: 'label-warning', disabled: 'label-default' }[status];
      },
      async create() {
        this.busy = true;
        this.createError = '';
        try {
          this.created = await post('admin/users', { ...this.form, password: this.form.password || undefined });
          this.form = { email: '', name: '', role: 'user', password: '', sendEmail: true };
          this.showCreate = false;
          await this.load();
        } catch (e) {
          this.createError = this.$err(e);
        } finally {
          this.busy = false;
        }
      },
    },
  };
</script>
