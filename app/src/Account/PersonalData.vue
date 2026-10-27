<template lang="pug">
  .row
    .col-md-6
      h4 {{ $t('account.exportTitle') }}
      p.text-muted {{ $t('account.exportHelp') }}
      a.btn.btn-default(href="api/me/export", download) {{ $t('account.exportButton') }}
    .col-md-6
      h4.text-danger {{ $t('account.deleteTitle') }}
      p.text-muted {{ $t('account.deleteHelp') }}
      .alert.alert-danger(v-if="error") {{ error }}
      form(@submit.prevent="remove")
        .form-group
          label {{ $t('auth.password') }}
          input.form-control(type="password", v-model="password", autocomplete="current-password", required)
        button.btn.btn-danger(type="submit", :disabled="busy") {{ $t('account.deleteButton') }}
</template>

<script>
  import { api } from '../common/api';

  export default {
    name: 'PersonalData',
    props: ['me'],
    data() {
      return { password: '', error: '', busy: false };
    },
    methods: {
      async remove() {
        if (!confirm(this.$t('account.confirmDeleteAccount'))) return;
        this.busy = true;
        this.error = '';
        try {
          await api('DELETE', 'me', { password: this.password });
          document.location.href = './';
        } catch (e) {
          this.error = this.$err(e);
        } finally {
          this.busy = false;
        }
      },
    },
  };
</script>
