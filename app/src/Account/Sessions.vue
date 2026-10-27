<template lang="pug">
  div
    .alert.alert-danger(v-if="error") {{ error }}
    p.text-muted {{ $t('account.sessionsHelp') }}
    table.table
      thead
        tr
          th {{ $t('account.device') }}
          th {{ $t('account.ip') }}
          th {{ $t('account.lastSeen') }}
          th {{ $t('account.created') }}
          th
      tbody
        tr(v-for="s in sessions", :key="s.id")
          td
            | {{ agent(s.userAgent) }}
            |
            span.label.label-success(v-if="s.current") {{ $t('account.thisDevice') }}
          td {{ s.ip || '–' }}
          td {{ s.lastSeenAt | date }}
          td {{ s.createdAt | date }}
          td.table-actions
            button.btn.btn-sm.btn-default(@click="revoke(s)") {{ s.current ? $root.lang.nav.logout : $t('account.revoke') }}
    button.btn.btn-danger(v-if="sessions.length > 1", @click="revokeOthers") {{ $t('account.revokeOthers') }}
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
