<template lang="pug">
  div
    p
      a(href="admin#/users") ‹ {{ $t('admin.users.back') }}
    .alert.alert-danger(v-if="error") {{ error }}
    .alert.alert-success(v-if="message")
      | {{ message }}
      template(v-if="link")
        br
        code.break-all {{ link }}
        |
        clipboard.btn.btn-xs.btn-default(:value="link")
    template(v-if="data")
      h3
        | {{ user.name || user.email }}
        |
        small {{ user.email }}
      p
        span.label(:class="user.role === 'admin' ? 'label-primary' : 'label-default'") {{ $t('admin.roles.' + user.role) }}
        span.label(:class="{active: 'label-success', pending: 'label-warning', disabled: 'label-default'}[user.status]") {{ $t('admin.users.statuses.' + user.status) }}
        span.label.label-success(v-if="user.totpEnabled") 2FA
        span.label.label-warning(v-if="!user.emailVerified") {{ $t('admin.users.unverified') }}
        span.label.label-danger(v-if="locked") {{ $t('admin.users.lockedUntil', { date: $options.filters.date(user.lockedUntil) }) }}

      .row
        .col-md-7
          form.admin-section(@submit.prevent="save")
            h4 {{ $t('admin.users.profile') }}
            .row
              .col-sm-6.form-group
                label {{ $t('auth.name') }}
                input.form-control(type="text", v-model.trim="form.name")
              .col-sm-6.form-group
                label {{ $t('auth.email') }}
                input.form-control(type="email", v-model.trim="form.email", required)
              .col-sm-6.form-group
                label {{ $t('admin.users.role') }}
                select.form-control(v-model="form.role", :disabled="isMe")
                  option(value="user") {{ $t('admin.roles.user') }}
                  option(value="admin") {{ $t('admin.roles.admin') }}
              .col-sm-6.form-group
                label {{ $t('admin.users.status') }}
                select.form-control(v-model="form.status", :disabled="isMe")
                  option(v-for="s in ['active', 'pending', 'disabled']", :value="s") {{ $t('admin.users.statuses.' + s) }}
            .checkbox
              label
                input(type="checkbox", v-model="form.emailVerified")
                |  {{ $t('admin.users.emailVerified') }}
            .checkbox
              label
                input(type="checkbox", v-model="form.notifyDownloads")
                |  {{ $t('account.notifyDownloads') }}
            h4 {{ $t('admin.users.quotas') }}
            p.text-muted.small(v-if="user.role === 'admin'") {{ $t('admin.users.adminNoQuota') }}
            quota-field(v-model="form.quotaTransfer", :label="$t('admin.users.quotaTransfer')", bytes,
              :global-value="globals.maxTransferSize")
            quota-field(v-model="form.quotaStorage", :label="$t('admin.users.quotaStorage')", bytes,
              :global-value="globals.userStorageQuota")
            quota-field(v-model="form.quotaTransfers", :label="$t('admin.users.quotaTransfers')",
              :global-value="globals.maxActiveTransfers")
            .form-group
              label {{ $t('admin.users.notes') }}
              textarea.form-control(v-model="form.notes", rows="3", :placeholder="$t('admin.users.notesHelp')")
            button.btn.btn-primary(type="submit", :disabled="busy") {{ $t('account.save') }}

        .col-md-5
          .admin-section
            h4 {{ $t('admin.users.overview') }}
            table.table.table-condensed.kv-table
              tbody
                tr
                  th {{ $t('admin.users.storage') }}
                  td {{ user.usage.storage | size }}
                    span.text-muted(v-if="data.limits.storage")  / {{ data.limits.storage | size }}
                tr
                  th {{ $t('admin.users.transfers') }}
                  td {{ user.usage.transfers }} ({{ user.usage.files }} {{ $t('admin.users.filesShort') }})
                tr
                  th {{ $t('admin.users.allUploads') }}
                  td {{ data.totals.uploads }} · {{ data.totals.uploadBytes | size }}
                tr
                  th {{ $t('admin.users.created_') }}
                  td {{ user.createdAt | date }}
                tr(v-if="data.invitedBy")
                  th {{ $t('admin.users.invitedBy') }}
                  td
                    a(:href="'admin#/users/' + data.invitedBy.id") {{ data.invitedBy.email }}
                tr
                  th {{ $t('admin.users.lastLogin') }}
                  td {{ user.lastLoginAt | date }}
                    span.text-muted(v-if="user.lastLoginIp")  · {{ user.lastLoginIp }}
                tr
                  th {{ $t('admin.users.passwordChanged') }}
                  td {{ user.passwordChangedAt | date }}
                tr
                  th {{ $t('admin.users.failedLogins') }}
                  td {{ user.failedLogins }}
          .admin-section
            h4 {{ $t('admin.users.actions') }}
            p
              button.btn.btn-default.btn-block(@click="resetLink(false)") {{ $t('admin.users.resetLink') }}
              button.btn.btn-default.btn-block(@click="resetLink(true)", :disabled="!mailEnabled") {{ $t('admin.users.resetMail') }}
              button.btn.btn-default.btn-block(@click="setPassword") {{ $t('admin.users.setPassword') }}
              button.btn.btn-default.btn-block(v-if="locked || user.failedLogins", @click="act('unlock')") {{ $t('admin.users.unlock') }}
              button.btn.btn-default.btn-block(v-if="!user.emailVerified", @click="act('verify-email')") {{ $t('admin.users.verifyEmail') }}
              button.btn.btn-warning.btn-block(v-if="user.totpEnabled", @click="confirmAct('disable-2fa', 'admin.users.confirmReset2fa')") {{ $t('admin.users.reset2fa') }}
              button.btn.btn-warning.btn-block(@click="revokeSessions") {{ $t('admin.users.revokeSessions') }}
            template(v-if="!isMe")
              .checkbox
                label
                  input(type="checkbox", v-model="keepTransfers")
                  |  {{ $t('admin.users.keepTransfers') }}
              button.btn.btn-danger.btn-block(@click="remove") {{ $t('admin.users.delete') }}

      .admin-section
        h4 {{ $t('admin.users.transfersTitle') }}
        transfer-table(:items="data.transfers", :show-owner="false", @changed="load")

      .admin-section
        h4 {{ $t('admin.users.sessionsTitle') }}
        p.text-muted(v-if="!data.sessions.length") {{ $t('admin.empty') }}
        table.table.table-condensed(v-else)
          tbody
            tr(v-for="s in data.sessions", :key="s.id")
              td {{ agent(s.userAgent) }}
              td {{ s.ip || '–' }}
              td {{ $t('account.lastSeen') }} {{ s.lastSeenAt | date }}
              td.table-actions
                button.btn.btn-xs.btn-default(@click="revokeSession(s)") {{ $t('account.revoke') }}

      .row
        .col-md-6.admin-section
          h4 {{ $t('admin.users.activity') }}
          audit-table(:items="data.activity")
        .col-md-6.admin-section
          h4 {{ $t('admin.users.history') }}
          audit-table(:items="data.history")
</template>

<script>
  import Clipboard from '../common/Clipboard.vue';
  import QuotaField from './QuotaField.vue';
  import AuditTable from './AuditTable.vue';
  import TransferTable from './TransferTable.vue';
  import { get, post, patch, del, api } from '../common/api';
  import { userAgentLabel } from '../common/format';

  const FIELDS = ['name', 'email', 'role', 'status', 'emailVerified', 'notifyDownloads', 'quotaTransfer', 'quotaStorage',
    'quotaTransfers', 'notes'];

  export default {
    name: 'UserDetail',
    components: { Clipboard, QuotaField, AuditTable, TransferTable },
    props: ['id'],
    data() {
      return { data: null, form: {}, globals: {}, mailEnabled: false, error: '', message: '', link: '', busy: false,
        keepTransfers: false };
    },
    computed: {
      user() {
        return this.data.user;
      },
      isMe() {
        return this.$root.session.user && this.$root.session.user.id === this.user.id;
      },
      locked() {
        return this.user.lockedUntil && this.user.lockedUntil > Date.now();
      },
    },
    created() {
      this.load();
    },
    methods: {
      agent: userAgentLabel,
      async load() {
        this.error = '';
        try {
          const [data, settings] = await Promise.all([get('admin/users/' + this.id), get('admin/settings')]);
          this.data = data;
          this.globals = settings.values;
          this.mailEnabled = settings.mail.enabled;
          this.form = FIELDS.reduce((f, k) => ({ ...f, [k]: data.user[k] }), {});
        } catch (e) {
          this.error = this.$err(e);
        }
      },
      notify(message, link = '') {
        this.message = message;
        this.link = link;
        window.scrollTo(0, 0);
      },
      async run(fn) {
        this.busy = true;
        this.error = '';
        this.message = '';
        try {
          await fn();
        } catch (e) {
          this.error = this.$err(e);
          window.scrollTo(0, 0);
        } finally {
          this.busy = false;
        }
      },
      save() {
        return this.run(async () => {
          await patch('admin/users/' + this.id, this.form);
          await this.load();
          this.notify(this.$t('account.saved'));
        });
      },
      act(action) {
        return this.run(async () => {
          await post(`admin/users/${ this.id }/${ action }`);
          await this.load();
          this.notify(this.$t('admin.done'));
        });
      },
      confirmAct(action, question) {
        if (confirm(this.$t(question))) this.act(action);
      },
      resetLink(sendEmail) {
        return this.run(async () => {
          const res = await post(`admin/users/${ this.id }/reset-link`, { sendEmail });
          this.notify(res.mailed ? this.$t('admin.users.linkMailed') : this.$t('admin.users.linkToShare'), res.link);
        });
      },
      setPassword() {
        const password = prompt(this.$t('admin.users.newPasswordPrompt'));
        if (!password) return;
        return this.run(async () => {
          await post(`admin/users/${ this.id }/password`, { password });
          this.notify(this.$t('admin.users.passwordSet'));
        });
      },
      revokeSessions() {
        if (!confirm(this.$t('admin.users.confirmRevoke'))) return;
        return this.run(async () => {
          const res = await del(`admin/users/${ this.id }/sessions`);
          await this.load();
          this.notify(this.$t('admin.users.sessionsRevoked', { count: res.count }));
        });
      },
      revokeSession(s) {
        return this.run(async () => {
          await del(`admin/users/${ this.id }/sessions/${ encodeURIComponent(s.id) }`);
          await this.load();
        });
      },
      remove() {
        const question = this.keepTransfers ? 'admin.users.confirmDeleteKeep' : 'admin.users.confirmDelete';
        if (!confirm(this.$t(question, { email: this.user.email, count: this.user.usage.transfers }))) return;
        return this.run(async () => {
          await api('DELETE', `admin/users/${ this.id }${ this.keepTransfers ? '?transfers=keep' : '' }`);
          document.location.hash = '#/users';
        });
      },
    },
  };
</script>
