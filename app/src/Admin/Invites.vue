<template lang="pug">
  div
    .alert.alert-info(v-if="mode !== 'invite'")
      | {{ $t('admin.invites.modeNotice', { mode: $t('admin.settings.registrationModes.' + mode) }) }}
      |
      a(href="admin#/settings") {{ $root.lang.admin.warnings.settingsLink }}
    .row
      .col-md-5
        form.well(@submit.prevent="create")
          h4 {{ $t('admin.invites.create') }}
          .alert.alert-danger(v-if="error") {{ error }}
          .form-group
            label {{ $t('auth.email') }}
            input.form-control(type="email", v-model.trim="form.email", :placeholder="$t('admin.invites.emailOptional')")
          .form-group
            label {{ $t('admin.users.role') }}
            select.form-control(v-model="form.role")
              option(value="user") {{ $t('admin.roles.user') }}
              option(value="admin") {{ $t('admin.roles.admin') }}
          .row
            .col-xs-6.form-group
              label {{ $t('admin.invites.maxUses') }}
              input.form-control(type="number", min="1", v-model="form.maxUses", :placeholder="$t('admin.quota.unlimited')")
            .col-xs-6.form-group
              label {{ $t('admin.invites.validity') }}
              select.form-control(v-model="form.expiresInDays")
                option(:value="1") {{ $t('admin.dashboard.days', { count: 1 }) }}
                option(:value="7") {{ $t('admin.dashboard.days', { count: 7 }) }}
                option(:value="30") {{ $t('admin.dashboard.days', { count: 30 }) }}
                option(value="") {{ $t('admin.invites.noExpiry') }}
          .form-group
            label {{ $t('admin.invites.note') }}
            input.form-control(type="text", v-model.trim="form.note", maxlength="500")
          .checkbox(v-if="form.email")
            label
              input(type="checkbox", v-model="form.sendEmail")
              |  {{ $t('admin.invites.sendEmail') }}
          button.btn.btn-primary(type="submit", :disabled="busy") {{ $t('admin.invites.createButton') }}
        .alert.alert-success(v-if="created")
          | {{ created.mailed ? $t('admin.invites.mailed') : $t('admin.invites.copyNow') }}
          br
          code.break-all {{ created.link }}
          |
          clipboard.btn.btn-xs.btn-default(:value="created.link")
      .col-md-7
        table.table.table-condensed.admin-table
          thead
            tr
              th {{ $t('admin.invites.invite') }}
              th {{ $t('admin.invites.uses') }}
              th {{ $t('admin.invites.expires') }}
              th {{ $t('admin.invites.state') }}
              th
          tbody
            tr(v-if="!invites.length")
              td.text-muted(colspan="5") {{ $t('admin.empty') }}
            tr(v-for="i in invites", :key="i.id")
              td
                | {{ i.email || $t('admin.invites.anyEmail') }}
                |
                span.label.label-primary(v-if="i.role === 'admin'") {{ $t('admin.roles.admin') }}
                br
                small.text-muted {{ i.note }} {{ $t('admin.invites.by', { email: i.createdByEmail || '–', date: $day(i.createdAt) }) }}
              td {{ i.uses }} / {{ i.maxUses || '∞' }}
              td {{ $date(i.expiresAt) }}
              td
                span.label(:class="stateClass(i)") {{ $t('admin.invites.states.' + state(i)) }}
              td.table-actions
                button.btn.btn-xs.btn-default(v-if="state(i) === 'valid'", @click="revoke(i)") {{ $t('admin.invites.revoke') }}
                button.btn.btn-xs.btn-danger(v-else, @click="remove(i)") ✕
</template>

<script>
  import Clipboard from '../common/Clipboard.vue';
  import { get, post, del } from '../common/api';

  export default {
    name: 'Invites',
    components: { Clipboard },
    data() {
      return { invites: [], error: '', busy: false, created: null,
        form: { email: '', role: 'user', maxUses: 1, expiresInDays: 7, note: '', sendEmail: true } };
    },
    computed: {
      mode() {
        return this.$root.session.settings.registrationMode;
      },
    },
    created() {
      this.load();
    },
    methods: {
      state(i) {
        if (i.revokedAt) return 'revoked';
        if (i.expiresAt && i.expiresAt < Date.now()) return 'expired';
        if (i.maxUses && i.uses >= i.maxUses) return 'used';
        return 'valid';
      },
      stateClass(i) {
        return { valid: 'label-success', used: 'label-default', expired: 'label-warning', revoked: 'label-danger' }[this.state(i)];
      },
      async load() {
        try {
          this.invites = await get('admin/invites');
        } catch (e) {
          this.error = this.$err(e);
        }
      },
      async create() {
        this.busy = true;
        this.error = '';
        try {
          this.created = await post('admin/invites', {
            ...this.form,
            maxUses: this.form.maxUses === '' ? null : +this.form.maxUses,
            expiresInDays: this.form.expiresInDays === '' ? null : +this.form.expiresInDays,
          });
          this.form = { email: '', role: 'user', maxUses: 1, expiresInDays: 7, note: '', sendEmail: true };
          await this.load();
        } catch (e) {
          this.error = this.$err(e);
        } finally {
          this.busy = false;
        }
      },
      async revoke(i) {
        await post(`admin/invites/${ i.id }/revoke`).catch(e => (this.error = this.$err(e)));
        await this.load();
      },
      async remove(i) {
        await del(`admin/invites/${ i.id }`).catch(e => (this.error = this.$err(e)));
        await this.load();
      },
    },
  };
</script>
