<template lang="pug">
  div
    .alert.alert-danger.mb-4(v-if="error", role="alert") {{ error }}
    p.muted.mb-4 {{ $t('account.sessionsHelp') }}
    .card.table-wrap
      table.table
        thead
          tr
            th {{ $t('account.device') }}
            th {{ $t('account.ip') }}
            th {{ $t('account.lastSeen') }}
            th {{ $t('account.created') }}
            th
              span.sr-only {{ $t('account.revoke') }}
        tbody
          tr(v-for="s in sessions", :key="s.id")
            td
              span.font-semibold {{ agent(s.userAgent) }}
              span.badge.badge-success.ml-2(v-if="s.current") {{ $t('account.thisDevice') }}
            td.mono.text-xs {{ s.ip || '–' }}
            td.whitespace-nowrap {{ $date(s.lastSeenAt) }}
            td.whitespace-nowrap {{ $date(s.createdAt) }}
            td.actions
              button.btn.btn-sm(type="button", @click="revoke(s)") {{ s.current ? $root.lang.nav.logout : $t('account.revoke') }}
    button.btn.btn-danger.mt-4(v-if="sessions.length > 1", type="button", @click="revokeOthers") {{ $t('account.revokeOthers') }}
</template>

<script>
  import { get, del, post } from '../common/api';
  import { userAgentLabel } from '../common/format';

  export default {
    name: 'Sessions',
    data() {
      return { sessions: [], error: '' };
    },
    created() {
      this.load();
    },
    methods: {
      agent: userAgentLabel,
      async load() {
        try {
          this.sessions = await get('me/sessions');
        } catch (e) {
          this.error = this.$err(e);
        }
      },
      async revoke(s) {
        try {
          const res = await del('me/sessions/' + encodeURIComponent(s.id));
          if (res.current) return (document.location.href = 'login');
          await this.load();
        } catch (e) {
          this.error = this.$err(e);
        }
      },
      async revokeOthers() {
        try {
          await post('me/sessions/revoke-others');
          await this.load();
        } catch (e) {
          this.error = this.$err(e);
        }
      },
    },
  };
</script>
