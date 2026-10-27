<template lang="pug">
  form(@submit.prevent="save", style="max-width: 520px")
    .alert.alert-success(v-if="saved") {{ saved }}
    .alert.alert-danger(v-if="error") {{ error }}
    .form-group
      label(for="name") {{ $t('auth.name') }}
      input#name.form-control(type="text", v-model.trim="name", maxlength="100")
    .form-group
      label(for="email") {{ $t('auth.email') }}
      input#email.form-control(type="email", v-model.trim="email", required)
      p.help-block(v-if="!me.user.emailVerified") {{ $t('account.emailUnverified') }}
    .form-group(v-if="emailChanged")
      label(for="currentPassword") {{ $t('account.currentPassword') }}
      input#currentPassword.form-control(type="password", v-model="currentPassword", autocomplete="current-password", required)
    .form-group
      label(for="locale") {{ $t('account.language') }}
      select#locale.form-control(v-model="locale")
        option(value="") {{ $t('account.browserLanguage') }}
        option(v-for="l in languages", :value="l") {{ l }}
    .checkbox
      label
        input(type="checkbox", v-model="notifyDownloads")
        |  {{ $t('account.notifyDownloads') }}
    button.btn.btn-primary(type="submit", :disabled="busy") {{ $t('account.save') }}
</template>

<script>
  import { patch } from '../common/api';

  const LANGUAGES = ['en', 'fr', 'de', 'es', 'it', 'nl', 'pl', 'pt', 'ru', 'sv', 'tr', 'el', 'ja', 'ko', 'zh', 'zh-tw'];

  export default {
    name: 'Profile',
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
