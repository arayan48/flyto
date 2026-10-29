<template lang="pug">
  .auth-box
    .card.card-body.auth-card(v-if="done")
      h1.auth-title.text-success {{ $t('auth.registeredTitle') }}
      p(v-if="done === 'pending'") {{ $t('auth.registeredPending') }}
      p(v-else-if="done === 'verify'") {{ $t('auth.registeredVerify') }}
      a.btn(href="login") {{ $t('auth.loginButton') }}
    .card.card-body.auth-card(v-else-if="closed")
      h1.auth-title {{ $t('auth.registerTitle') }}
      .alert.alert-danger(v-if="error", role="alert") {{ error }}
      p {{ mode === 'invite' ? $t('auth.inviteOnly') : $t('auth.registrationClosed') }}
      a.btn(href="login") {{ $t('auth.loginButton') }}
    form.card.card-body.auth-card(v-else, @submit.prevent="submit")
      h1.auth-title {{ $t('auth.registerTitle') }}
      p.muted(v-if="invite") {{ $t('auth.invited') }}
      .alert.alert-danger(v-if="error", role="alert") {{ error }}
      .field
        label.label(for="name") {{ $t('auth.name') }}
        input#name.input(type="text", v-model.trim="name", autocomplete="name", maxlength="100")
      .field
        label.label(for="email") {{ $t('auth.email') }}
        input#email.input(type="email", v-model.trim="email", autocomplete="email", required,
          :readonly="!!(invite && invite.email)")
      .field
        label.label(for="password") {{ $t('auth.password') }}
        input#password.input(type="password", v-model="password", autocomplete="new-password", required,
          :minlength="minLength")
        p.hint {{ $t('auth.passwordHint', { min: minLength }) }}
      .field
        label.label(for="password2") {{ $t('auth.passwordRepeat') }}
        input#password2.input(type="password", v-model="password2", autocomplete="new-password", required)
      p.text-sm.muted(v-if="settings.termsUrl || settings.privacyUrl")
        | {{ $t('auth.termsNotice') }}
        |
        a(v-if="settings.termsUrl", :href="settings.termsUrl", target="_blank", rel="noopener") {{ $root.lang.nav.terms }}
        template(v-if="settings.termsUrl && settings.privacyUrl")  ·
        a(v-if="settings.privacyUrl", :href="settings.privacyUrl", target="_blank", rel="noopener") {{ $root.lang.nav.privacy }}
      button.btn.btn-primary(type="submit", :disabled="busy") {{ $t('auth.registerButton') }}
      .auth-links
        a(href="login") {{ $t('auth.haveAccount') }}
</template>

<script>
  import { get, post, setCsrf } from '../common/api';

  export default {
    name: 'Register',
    data() {
      return { name: '', email: '', password: '', password2: '', error: '', busy: false, done: false,
        invite: null, inviteToken: null };
    },
    computed: {
      settings() {
        return this.$root.session.settings;
      },
      mode() {
        return this.settings.registrationMode;
      },
      minLength() {
        return this.settings.passwordMinLength;
      },
      closed() {
        return !this.invite && this.mode !== 'open';
      },
    },
    async created() {
      const match = /[?&]invite=([^&]+)/.exec(document.location.search);
      if (!match) return;
      this.inviteToken = decodeURIComponent(match[1]);
      try {
        this.invite = await get('auth/invite/' + encodeURIComponent(this.inviteToken));
        if (this.invite.email) this.email = this.invite.email;
      } catch (e) {
        this.error = this.$err(e);
        this.inviteToken = null;
      }
    },
    methods: {
      async submit() {
        this.error = '';
        if (this.password !== this.password2) {
          this.error = this.$t('auth.passwordMismatch');
          return;
        }
        this.busy = true;
        try {
          const res = await post('auth/register', { name: this.name, email: this.email, password: this.password,
            invite: this.inviteToken || undefined });
          if (res.pending) this.done = 'pending';
          else if (!res.csrf) this.done = 'verify';
          else {
            setCsrf(res.csrf);
            this.$root.goNext('./');
          }
        } catch (e) {
          this.error = this.$err(e);
        } finally {
          this.busy = false;
        }
      },
    },
  };
</script>
