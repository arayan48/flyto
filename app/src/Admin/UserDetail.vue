<template lang="pug">
  div
    a.back-link(href="admin#/users")
      icon(name="arrow-left")
      | {{ $t('admin.users.back') }}
    .alert.alert-danger(v-if="error") {{ error }}
    created-link.mb-4(v-if="message", :text="message", :link="link")
    template(v-if="data")
      h1.text-xl
        | {{ user.name || user.email }}
        |
        small {{ user.email }}
      p
        span.badge(:class="user.role === 'admin' ? 'badge-accent' : ''") {{ $t('admin.roles.' + user.role) }}
        span.badge(:class="{active: 'badge-success', pending: 'badge-warning', disabled: ''}[user.status]") {{ $t('admin.users.statuses.' + user.status) }}
        span.badge.badge-success(v-if="user.totpEnabled") 2FA
        span.badge.badge-warning(v-if="!user.emailVerified") {{ $t('admin.users.unverified') }}
        span.badge.badge-danger(v-if="locked") {{ $t('admin.users.lockedUntil', { date: $date(user.lockedUntil) }) }}

      .grid-75
        div
          form.card.form-card(@submit.prevent="save")
            h2.section-title {{ $t('admin.users.profile') }}
            .grid-2
              .field
                label.label {{ $t('auth.name') }}
                input.input(type="text", v-model.trim="form.name")
              .field
                label.label {{ $t('auth.email') }}
                input.input(type="email", v-model.trim="form.email", required)
              .field
                label.label {{ $t('admin.users.role') }}
                select.select(v-model="form.role", :disabled="isMe")
                  option(value="user") {{ $t('admin.roles.user') }}
                  option(value="admin") {{ $t('admin.roles.admin') }}
              .field
                label.label {{ $t('admin.users.status') }}
                select.select(v-model="form.status", :disabled="isMe")
                  option(v-for="s in ['active', 'pending', 'disabled']", :value="s") {{ $t('admin.users.statuses.' + s) }}
            label.check
              input(type="checkbox", v-model="form.emailVerified")
              span {{ $t('admin.users.emailVerified') }}
            label.check
              input(type="checkbox", v-model="form.notifyDownloads")
              span {{ $t('account.notifyDownloads') }}
            h2.section-title {{ $t('admin.users.quotas') }}
            p.muted.text-sm(v-if="user.role === 'admin'") {{ $t('admin.users.adminNoQuota') }}
            quota-field(v-model="form.quotaTransfer", :label="$t('admin.users.quotaTransfer')", bytes,
              :global-value="globals.maxTransferSize")
            quota-field(v-model="form.quotaStorage", :label="$t('admin.users.quotaStorage')", bytes,
              :global-value="globals.userStorageQuota")
            quota-field(v-model="form.quotaTransfers", :label="$t('admin.users.quotaTransfers')",
              :global-value="globals.maxActiveTransfers")
            .field
              label.label {{ $t('admin.users.notes') }}
              textarea.textarea(v-model="form.notes", rows="3", :placeholder="$t('admin.users.notesHelp')")
            div
              button.btn.btn-primary(type="submit", :disabled="busy") {{ $t('account.save') }}

        div
          .admin-section
            h2.section-title {{ $t('admin.users.overview') }}
            .card.kv-card
              table.kv-table
                tbody
                  tr
                    th {{ $t('admin.users.storage') }}
                    td {{ $size(user.usage.storage) }}
                      span.muted(v-if="data.limits.storage")  / {{ $size(data.limits.storage) }}
                  tr
                    th {{ $t('admin.users.transfers') }}
                    td {{ user.usage.transfers }} ({{ user.usage.files }} {{ $t('admin.users.filesShort') }})
                  tr
                    th {{ $t('admin.users.allUploads') }}
                    td {{ data.totals.uploads }} · {{ $size(data.totals.uploadBytes) }}
                  tr
                    th {{ $t('admin.users.created_') }}
                    td {{ $date(user.createdAt) }}
                  tr(v-if="data.invitedBy")
                    th {{ $t('admin.users.invitedBy') }}
                    td
                      a(:href="'admin#/users/' + data.invitedBy.id") {{ data.invitedBy.email }}
                  tr
                    th {{ $t('admin.users.lastLogin') }}
                    td {{ $date(user.lastLoginAt) }}
                      span.muted(v-if="user.lastLoginIp")  · {{ user.lastLoginIp }}
                  tr
                    th {{ $t('admin.users.passwordChanged') }}
                    td {{ $date(user.passwordChangedAt) }}
                  tr
                    th {{ $t('admin.users.failedLogins') }}
                    td {{ user.failedLogins }}
          .admin-section
            h2.section-title {{ $t('admin.users.actions') }}
            .stack-actions
              button.btn.w-full(@click="resetLink(false)") {{ $t('admin.users.resetLink') }}
              button.btn.w-full(@click="resetLink(true)", :disabled="!mailEnabled") {{ $t('admin.users.resetMail') }}
              button.btn.w-full(@click="setPassword") {{ $t('admin.users.setPassword') }}
              button.btn.w-full(v-if="locked || user.failedLogins", @click="act('unlock')") {{ $t('admin.users.unlock') }}
              button.btn.w-full(v-if="!user.emailVerified", @click="act('verify-email')") {{ $t('admin.users.verifyEmail') }}
              button.btn.w-full(v-if="user.totpEnabled", @click="confirmAct('disable-2fa', 'admin.users.confirmReset2fa')") {{ $t('admin.users.reset2fa') }}
              button.btn.w-full(@click="revokeSessions") {{ $t('admin.users.revokeSessions') }}
            template(v-if="!isMe")
              label.check
                input(type="checkbox", v-model="keepTransfers")
                span {{ $t('admin.users.keepTransfers') }}
              button.btn.btn-danger.w-full(@click="remove") {{ $t('admin.users.delete') }}

      .admin-section
        h2.section-title {{ $t('admin.users.transfersTitle') }}
        transfer-table(:items="data.transfers", :show-owner="false", @changed="load")

      .admin-section
        h2.section-title {{ $t('admin.users.sessionsTitle') }}
        p.muted(v-if="!data.sessions.length") {{ $t('admin.empty') }}
        .card.table-wrap(v-else)
          table.table
            tbody
              tr(v-for="s in data.sessions", :key="s.id")
                td {{ agent(s.userAgent) }}
                td {{ s.ip || '–' }}
                td {{ $t('account.lastSeen') }} {{ $date(s.lastSeenAt) }}
                td.actions
                  button.btn.btn-sm(@click="revokeSession(s)") {{ $t('account.revoke') }}

      .grid-2
        .admin-section
          h2.section-title {{ $t('admin.users.activity') }}
          audit-table(:items="data.activity")
        .admin-section
          h2.section-title {{ $t('admin.users.history') }}
          audit-table(:items="data.history")
</template>

<script>
  import CreatedLink from './CreatedLink.vue';
  import QuotaField from './QuotaField.vue';
  import AuditTable from './AuditTable.vue';
  import TransferTable from './TransferTable.vue';
  import { get, post, patch, del, api } from '../common/api';
  import { userAgentLabel } from '../common/format';

  const FIELDS = ['name', 'email', 'role', 'status', 'emailVerified', 'notifyDownloads', 'quotaTransfer', 'quotaStorage',
    'quotaTransfers', 'notes'];

  export default {
    name: 'UserDetail',
    components: { CreatedLink, QuotaField, AuditTable, TransferTable },
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
