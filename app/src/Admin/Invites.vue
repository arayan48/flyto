<template lang="pug">
  div
    .alert.alert-info.mb-4(v-if="mode !== 'invite'")
      div
        | {{ $t('admin.invites.modeNotice', { mode: $t('admin.settings.registrationModes.' + mode) }) }}
        |
        a(href="admin#/settings") {{ $root.lang.admin.warnings.settingsLink }}
    .invites-layout
      div
        form.card.form-card(@submit.prevent="create")
          h2.section-title {{ $t('admin.invites.create') }}
          .alert.alert-danger(v-if="error") {{ error }}
          .field
            label.label {{ $t('auth.email') }}
            input.input(type="email", v-model.trim="form.email", :placeholder="$t('admin.invites.emailOptional')")
          .field
            label.label {{ $t('admin.users.role') }}
            select.select(v-model="form.role")
              option(value="user") {{ $t('admin.roles.user') }}
              option(value="admin") {{ $t('admin.roles.admin') }}
          .grid-2
            .field
              label.label {{ $t('admin.invites.maxUses') }}
              input.input(type="number", min="1", v-model="form.maxUses", :placeholder="$t('admin.quota.unlimited')")
            .field
              label.label {{ $t('admin.invites.validity') }}
              select.select(v-model="form.expiresInDays")
                option(:value="1") {{ $t('admin.dashboard.days', { count: 1 }) }}
                option(:value="7") {{ $t('admin.dashboard.days', { count: 7 }) }}
                option(:value="30") {{ $t('admin.dashboard.days', { count: 30 }) }}
                option(value="") {{ $t('admin.invites.noExpiry') }}
          .field
            label.label {{ $t('admin.invites.note') }}
            input.input(type="text", v-model.trim="form.note", maxlength="500")
          label.check(v-if="form.email")
            input(type="checkbox", v-model="form.sendEmail")
            span {{ $t('admin.invites.sendEmail') }}
          div
            button.btn.btn-primary(type="submit", :disabled="busy") {{ $t('admin.invites.createButton') }}
        created-link.mt-4(v-if="created", :link="created.link", :text="created.mailed ? $t('admin.invites.mailed') : $t('admin.invites.copyNow')")
      div
        .card.table-wrap
          table.table.admin-table
            thead
              tr
                th {{ $t('admin.invites.invite') }}
                th {{ $t('admin.invites.uses') }}
                th {{ $t('admin.invites.expires') }}
                th {{ $t('admin.invites.state') }}
                th
            tbody
              tr(v-if="!invites.length")
                td.muted(colspan="5") {{ $t('admin.empty') }}
              tr(v-for="i in invites", :key="i.id")
                td
                  | {{ i.email || $t('admin.invites.anyEmail') }}
                  |
                  span.badge.badge-accent(v-if="i.role === 'admin'") {{ $t('admin.roles.admin') }}
                  br
                  small.muted {{ i.note }} {{ $t('admin.invites.by', { email: i.createdByEmail || '–', date: $day(i.createdAt) }) }}
                td {{ i.uses }} / {{ i.maxUses || '∞' }}
                td {{ $date(i.expiresAt) }}
                td
                  span.badge(:class="stateClass(i)") {{ $t('admin.invites.states.' + state(i)) }}
                td.actions
                  button.btn.btn-sm(v-if="state(i) === 'valid'", @click="revoke(i)") {{ $t('admin.invites.revoke') }}
                  button.btn.btn-sm.btn-ghost.btn-icon.btn-danger(v-else, type="button", @click="remove(i)",
                    :title="$t('admin.transfers.delete')", :aria-label="$t('admin.transfers.delete')")
                    icon(name="times")
</template>

<script>
  import CreatedLink from './CreatedLink.vue';
  import { get, post, del } from '../common/api';

  export default {
    name: 'Invites',
    components: { CreatedLink },
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
        return { valid: 'badge-success', used: '', expired: 'badge-warning', revoked: 'badge-danger' }[this.state(i)];
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
