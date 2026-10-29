<template lang="pug">
  div
    a.back-link(href="admin#/transfers")
      icon(name="arrow-left")
      | {{ $t('admin.transfers.back') }}
    .alert.alert-danger(v-if="error") {{ error }}
    .alert.alert-success(v-if="message") {{ message }}
    template(v-if="t")
      h1.text-xl
        span.mono {{ t.sid }}
        |
        small {{ t.files }} {{ $t('admin.users.filesShort') }} · {{ $size(t.size) }}
      .alert.alert-danger(v-if="t.suspendedAt")
        strong {{ $t('admin.transfers.suspendedOn', { date: $date(t.suspendedAt) }) }}
        template(v-if="t.suspendedReason")  {{ t.suspendedReason }}
      .grid-75
        div
          .card.kv-card
            table.kv-table
              tbody
                tr
                  th {{ $t('admin.transfers.link') }}
                  td
                    a.break-all(:href="t.url", target="_blank", rel="noopener") {{ t.url }}
                    |
                    clipboard.btn.btn-sm(:value="t.url")
                tr
                  th {{ $t('admin.transfers.owner') }}
                  td
                    a(v-if="t.owner", :href="'admin#/users/' + t.owner.id") {{ t.owner.name || t.owner.email }}
                    span.muted(v-else) {{ $t('admin.transfers.anonymous') }}
                tr
                  th {{ $t('admin.transfers.created') }}
                  td {{ $date(t.createdAt) }}
                tr
                  th {{ $t('admin.transfers.expires') }}
                  td
                    template(v-if="t.oneTime") {{ $t('admin.transfers.status.oneTime') }} ·
                    | {{ $date(t.expiresAt) }}
                tr
                  th {{ $t('admin.transfers.downloads') }}
                  td {{ t.downloads }}
                    span.muted(v-if="t.lastDownload")  · {{ $t('admin.transfers.last') }} {{ $date(t.lastDownload) }}
                tr
                  th {{ $t('admin.transfers.protection') }}
                  td
                    span.badge(v-if="t.password") {{ $t('admin.transfers.status.protected') }}
                    span.badge.badge-accent(v-if="t.locked") {{ $t('admin.transfers.locked') }}
                    span.badge.badge-warning(v-if="t.partial") {{ $t('admin.transfers.status.partial') }}
        div
          .admin-section
            h2.section-title {{ $t('admin.users.actions') }}
            form.inline-form.mb-2(@submit.prevent="setExpiration")
              input.input(type="datetime-local", v-model="expiresAt", required)
              |
              button.btn.btn-sm(type="submit") {{ $t('admin.transfers.setExpiration') }}
            form.inline-form.mb-4(@submit.prevent="setOwner")
              input.input(type="email", v-model.trim="ownerEmail", :placeholder="$t('admin.transfers.ownerEmail')")
              |
              button.btn.btn-sm(type="submit") {{ $t('admin.transfers.changeOwner') }}
            button.btn.w-full(v-if="t.suspendedAt", @click="unsuspend") {{ $t('admin.transfers.unsuspend') }}
            button.btn.w-full(v-else, @click="suspend") {{ $t('admin.transfers.suspend') }}
            button.btn.btn-danger.w-full(@click="remove") {{ $t('admin.transfers.delete') }}

      .admin-section
        h2.section-title {{ $t('admin.transfers.filesTitle') }}
        .card.table-wrap
          table.table.admin-table
            thead
              tr
                th {{ $t('admin.transfers.file') }}
                th {{ $t('admin.transfers.created') }}
                th {{ $t('admin.transfers.expires') }}
                th.text-right {{ $t('admin.transfers.downloads') }}
                th.text-right {{ $t('admin.transfers.size') }}
                th
            tbody
              tr(v-for="f in t.items", :key="f.key")
                td
                  | {{ f.name }}
                  br
                  small.muted(v-if="f.comment") {{ f.comment }}
                  small.muted(v-if="f.type")  {{ f.type }}
                  span.badge.badge-warning(v-if="f.partial")  {{ $t('admin.transfers.received', { received: $size(f.received), total: $size(f.size) }) }}
                td {{ $date(f.createdAt) }}
                td {{ $date(f.expiresAt) }}
                td.text-right {{ f.downloads }}
                td.text-right {{ $size(f.size) }}
                td.actions
                  a.btn.btn-sm(v-if="!f.partial && f.retention !== 'one-time'", :href="'files/' + encodeURIComponent(t.sid + '++' + f.key)",
                    :title="$t('admin.transfers.download')", :aria-label="$t('admin.transfers.download')")
                  icon(name="download")
                  button.btn.btn-sm.btn-icon.btn-ghost.btn-danger(type="button", @click="removeFile(f)", :title="$t('admin.transfers.deleteFile')", :aria-label="$t('admin.transfers.deleteFile')")
                  icon(name="times")
        p.muted.text-sm {{ $t('admin.transfers.downloadNote') }}

      .grid-75
        .admin-section
          h2.section-title {{ $t('admin.transfers.log') }}
          p.muted(v-if="!t.log.length") {{ $t('admin.empty') }}
          .card.table-wrap(v-else)
            table.table
              tbody
                tr(v-for="(d, i) in t.log", :key="i")
                  td {{ $date(d.at) }}
                  td {{ d.name }}
                  td {{ d.ip || '–' }}
                  td.text-sm.muted {{ agent(d.userAgent) }}
        .admin-section
          h2.section-title {{ $t('admin.users.history') }}
          audit-table(:items="t.history")
</template>

<script>
  import Clipboard from '../common/Clipboard.vue';
  import AuditTable from './AuditTable.vue';
  import { get, post, del, query } from '../common/api';
  import { userAgentLabel } from '../common/format';

  function toLocalInput(ms) {
    if (!ms) return '';
    const d = new Date(ms - new Date().getTimezoneOffset() * 60000);
    return d.toISOString().slice(0, 16);
  }

  export default {
    name: 'TransferDetail',
    components: { Clipboard, AuditTable },
    props: ['sid'],
    data() {
      return { t: null, error: '', message: '', expiresAt: '', ownerEmail: '' };
    },
    created() {
      this.load();
    },
    methods: {
      agent: userAgentLabel,
      async load() {
        try {
          this.t = await get('admin/transfers/' + encodeURIComponent(this.sid));
          this.expiresAt = toLocalInput(this.t.expiresAt);
          this.ownerEmail = this.t.owner ? this.t.owner.email : '';
        } catch (e) {
          this.error = this.$err(e);
        }
      },
      async run(fn, done) {
        this.error = '';
        this.message = '';
        try {
          await fn();
          if (done) this.message = done;
          await this.load();
        } catch (e) {
          this.error = this.$err(e);
        }
      },
      setExpiration() {
        return this.run(() => post(`admin/transfers/${ encodeURIComponent(this.sid) }/expiration`,
          { expiresAt: new Date(this.expiresAt).getTime() }), this.$t('admin.done'));
      },
      setOwner() {
        return this.run(async () => {
          let ownerId = null;
          if (this.ownerEmail) {
            const found = await get('admin/users' + query({ q: this.ownerEmail, perPage: 5 }));
            const user = found.items.find(u => u.email.toLowerCase() === this.ownerEmail.toLowerCase());
            if (!user) throw new Error(this.$t('errors.userNotFound'));
            ownerId = user.id;
          }
          await post(`admin/transfers/${ encodeURIComponent(this.sid) }/owner`, { ownerId });
        }, this.$t('admin.done'));
      },
      suspend() {
        const reason = prompt(this.$t('admin.transfers.reasonPrompt'));
        if (reason === null) return;
        return this.run(() => post(`admin/transfers/${ encodeURIComponent(this.sid) }/suspend`, { reason }));
      },
      unsuspend() {
        return this.run(() => post(`admin/transfers/${ encodeURIComponent(this.sid) }/unsuspend`));
      },
      async remove() {
        if (!confirm(this.$t('admin.transfers.confirmDelete'))) return;
        try {
          await del('admin/transfers/' + encodeURIComponent(this.sid));
          document.location.hash = '#/transfers';
        } catch (e) {
          this.error = this.$err(e);
        }
      },
      async removeFile(f) {
        if (!confirm(this.$t('account.confirmDeleteFile', { name: f.name }))) return;
        if (this.t.items.length === 1) return this.remove();
        return this.run(() => del(`admin/transfers/${ encodeURIComponent(this.sid) }/files/${ encodeURIComponent(f.key) }`));
      },
    },
  };
</script>
