<template lang="pug">
  form.form-stack(@submit.prevent="save")
    .alert.alert-success(v-if="saved", role="status") {{ saved }}
    .alert.alert-danger(v-if="error", role="alert") {{ error }}
    .field
      label.label(for="name") {{ $t('auth.name') }}
      input#name.input(type="text", v-model.trim="name", maxlength="100", autocomplete="name")
    .field
      label.label(for="email") {{ $t('auth.email') }}
      input#email.input(type="email", v-model.trim="email", required, autocomplete="email")
      p.hint(v-if="!me.user.emailVerified") {{ $t('account.emailUnverified') }}
    .field(v-if="emailChanged")
      label.label(for="currentPassword") {{ $t('account.currentPassword') }}
      input#currentPassword.input(type="password", v-model="currentPassword", autocomplete="current-password", required)
    .field
      label.label(for="locale") {{ $t('account.language') }}
      select#locale.select(v-model="locale")
        option(value="") {{ $t('account.browserLanguage') }}
        option(v-for="l in languages", :key="l", :value="l") {{ l }}
    label.check
      input(type="checkbox", v-model="notifyDownloads")
      span {{ $t('account.notifyDownloads') }}
    div
      button.btn.btn-primary(type="submit", :disabled="busy") {{ $t('account.save') }}
</template>

<script>
  import { patch } from '../common/api';

  const LANGUAGES = ['en', 'fr', 'de', 'es', 'it', 'nl', 'pl', 'pt', 'ru', 'sv', 'tr', 'el', 'ja', 'ko', 'zh', 'zh-tw'];

  export default {
    name: 'Profile',
    emits: ['changed'],
    props: ['me'],
    data() {
      const u = this.me.user;
      return { name: u.name, email: u.email, locale: u.locale || '', notifyDownloads: u.notifyDownloads,
        currentPassword: '', busy: false, error: '', saved: '', languages: LANGUAGES };
    },
    computed: {
      emailChanged() {
        return this.email.toLowerCase() !== this.me.user.email.toLowerCase();
      },
    },
    methods: {
      async save() {
        this.busy = true;
        this.error = '';
        this.saved = '';
        try {
          const res = await patch('me', { name: this.name, email: this.email, locale: this.locale || null,
            notifyDownloads: this.notifyDownloads, currentPassword: this.currentPassword || undefined });
          this.saved = res.verificationSent ? this.$t('account.emailChangeSent') : this.$t('account.saved');
          this.currentPassword = '';
          if (res.verificationSent) this.email = this.me.user.email;
          this.$emit('changed');
        } catch (e) {
          this.error = this.$err(e);
        } finally {
          this.busy = false;
        }
      },
    },
  };
</script>
