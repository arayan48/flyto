<template lang="pug">
  .split
    section.card.card-body
      h2.text-lg.mb-2 {{ $t('account.exportTitle') }}
      p.muted.mb-4 {{ $t('account.exportHelp') }}
      a.btn(href="api/me/export", download)
        icon(name="download")
        | {{ $t('account.exportButton') }}
    section.card.card-body.danger-zone
      h2.text-lg.mb-2 {{ $t('account.deleteTitle') }}
      p.muted.mb-4 {{ $t('account.deleteHelp') }}
      .alert.alert-danger.mb-4(v-if="error", role="alert") {{ error }}
      form.form-stack(@submit.prevent="remove")
        .field
          label.label(for="deletePassword") {{ $t('auth.password') }}
          input#deletePassword.input(type="password", v-model="password", autocomplete="current-password", required)
        div
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
