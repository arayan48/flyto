<template lang="pug">
  div(v-if="schema")
    .grid-label
      nav.settings-groups
        button(v-for="g in groupNames", :key="g", type="button", :aria-current="group === g ? 'true' : null",
          @click="group = g") {{ $t('admin.settings.groups.' + g) }}
      div
        .alert.alert-danger.mb-4(v-if="error", role="alert") {{ error }}
        .alert.alert-success.mb-4(v-if="message", role="status") {{ message }}
        form.card.form-card.settings-form(@submit.prevent="save")
          .field(v-for="key in groups[group]", :key="key", :class="{ 'is-dirty': dirty(key) }")
            template(v-if="schema[key].type === 'boolean'")
              label.check
                input(type="checkbox", v-model="values[key]")
                span {{ label(key) }}
            template(v-else)
              label.label(:for="'s-' + key") {{ label(key) }}
              textarea.textarea(v-if="textareas.includes(key)", :id="'s-' + key", v-model="values[key]", rows="3")
              byte-input(v-else-if="bytes.includes(key)", :model-value="values[key] || null",
                @update:model-value="v => values[key] = v || 0", :placeholder="$t('admin.quota.unlimited')")
              select.select(v-else-if="schema[key].type === 'enum'", :id="'s-' + key", v-model="values[key]")
                option(v-for="v in enumValues(key)", :value="v") {{ enumLabel(key, v) }}
              .flex.flex-wrap.gap-x-5.gap-y-2(v-else-if="schema[key].type === 'list'")
                label.check(v-for="v in schema[key].values", :key="v")
                  input(type="checkbox", :value="v", v-model="values[key]")
                  span {{ enumLabel(key, v) }}
              input.input(v-else-if="schema[key].type === 'integer'", :id="'s-' + key", type="number",
                v-model.number="values[key]", :min="schema[key].min", :max="schema[key].max")
              input.input(v-else, :id="'s-' + key", :type="schema[key].type === 'secret' ? 'password' : 'text'",
                v-model="values[key]", autocomplete="off")
            p.hint(v-if="help(key)") {{ help(key) }}
            p.hint(v-if="isCustom(key)")
              button.link-button(type="button", @click="reset(key)") {{ $t('admin.settings.resetDefault') }}

          template(v-if="group === 'email'")
            p.muted(v-if="mail.fromEnv") {{ $t('admin.settings.smtpFromEnv') }}
            .input-group
              input.input(type="email", v-model.trim="testTo", :placeholder="$root.session.user.email",
                :aria-label="$t('admin.settings.testEmail')")
              button.btn(type="button", @click="testEmail", :disabled="testing") {{ $t('admin.settings.testEmail') }}

          .settings-actions
            button.btn.btn-primary(type="submit", :disabled="busy || !changedKeys.length")
              | {{ $t('admin.settings.save') }}
              span.tnum(v-if="changedKeys.length")  ({{ changedKeys.length }})
            button.btn(type="button", v-if="changedKeys.length", @click="load") {{ $t('admin.cancel') }}
</template>

<script>
  import ByteInput from './ByteInput.vue';
  import { get, patch, post } from '../common/api';

  const GROUPS = {
    general: ['siteName', 'siteDescription', 'publicUrl'],
    legal: ['legalPublisher', 'contactEmail', 'legalHost', 'termsUrl', 'privacyUrl'],
    announcements: ['announcementText', 'announcementLevel', 'maintenanceMode', 'maintenanceMessage'],
    accounts: ['registrationMode', 'requireApproval', 'requireEmailVerification', 'allowedEmailDomains', 'notifyAdminsOnSignup'],
    security: ['passwordMinLength', 'sessionDays', 'loginMaxAttempts', 'lockoutMinutes', 'require2faForAdmins',
      'downloadPasswordAttempts'],
    uploads: ['anonymousUpload', 'maxTransferSize', 'maxFileSize', 'userStorageQuota', 'maxActiveTransfers',
      'maxFilesPerTransfer', 'retentions', 'defaultRetention', 'requireTransferPassword', 'blockedExtensions'],
    downloads: ['disableQrCode', 'maxPreviewSize', 'mailTemplate', 'logDownloadIps', 'anonymizeIps'],
    email: ['smtpHost', 'smtpPort', 'smtpSecure', 'smtpUser', 'smtpPass', 'smtpFrom'],
    housekeeping: ['auditRetentionDays', 'downloadLogRetentionDays'],
  };

  export default {
    name: 'Settings',
    components: { ByteInput },
    data() {
      return {
        schema: null, values: {}, original: {}, retentionLabels: {}, mail: {}, group: 'general', groups: GROUPS,
        groupNames: Object.keys(GROUPS), error: '', message: '', busy: false, testTo: '', testing: false,
        textareas: ['siteDescription', 'announcementText', 'maintenanceMessage', 'allowedEmailDomains', 'blockedExtensions', 'legalHost'],
        bytes: ['maxTransferSize', 'maxFileSize', 'userStorageQuota', 'maxPreviewSize'],
      };
    },
    computed: {
      changedKeys() {
        return Object.keys(this.values).filter(k => this.dirty(k));
      },
    },
    created() {
      this.load();
    },
    methods: {
      async load() {
        this.error = '';
        try {
          const res = await get('admin/settings');
          this.schema = res.schema;
          this.retentionLabels = res.retentionLabels;
          this.mail = res.mail;
          this.values = JSON.parse(JSON.stringify(res.values));
          this.original = JSON.parse(JSON.stringify(res.values));
        } catch (e) {
          this.error = this.$err(e);
        }
      },
      dirty(key) {
        return JSON.stringify(this.values[key]) !== JSON.stringify(this.original[key]);
      },
      isCustom(key) {
        const def = this.schema[key];
        return def.type !== 'secret' && JSON.stringify(this.original[key]) !== JSON.stringify(def.default);
      },
      label(key) {
        return (this.$root.lang.admin.settings.fields[key] || key);
      },
      help(key) {
        return (this.$root.lang.admin.settings.help || {})[key] || '';
      },
      enumValues(key) {
        return this.schema[key].values.filter(v => key !== 'defaultRetention' || this.values.retentions.includes(v));
      },
      enumLabel(key, v) {
        if (key === 'retentions' || key === 'defaultRetention') {
          return (this.$root.lang.retentions && this.$root.lang.retentions[v]) || this.retentionLabels[v] || v;
        }
        const labels = this.$root.lang.admin.settings[key + 's'] || this.$root.lang.admin.settings[key + 'Values'] || {};
        return labels[v] || v;
      },
      async save() {
        this.busy = true;
        this.error = '';
        this.message = '';
        try {
          const body = {};
          for (const k of this.changedKeys) body[k] = this.values[k];
          const res = await patch('admin/settings', body);
          this.values = JSON.parse(JSON.stringify(res.values));
          this.original = JSON.parse(JSON.stringify(res.values));
          this.message = this.$t('admin.settings.saved', { count: res.changed.length });
          await this.$root.$nextTick();
        } catch (e) {
          this.error = this.$err(e);
        } finally {
          this.busy = false;
        }
      },
      async reset(key) {
        try {
          const res = await post('admin/settings/reset', { key });
          this.values = JSON.parse(JSON.stringify(res.values));
          this.original = JSON.parse(JSON.stringify(res.values));
        } catch (e) {
          this.error = this.$err(e);
        }
      },
      async testEmail() {
        this.testing = true;
        this.error = '';
        this.message = '';
        try {
          const res = await post('admin/settings/test-email', { to: this.testTo });
          this.message = this.$t('admin.settings.testSent', { to: res.to });
        } catch (e) {
          this.error = this.$err(e);
        } finally {
          this.testing = false;
        }
      },
    },
  };
</script>

<style>
  .settings-groups {
    display: flex;
    gap: .25rem;
    overflow-x: auto;
    scrollbar-width: none;
  }
  @media (min-width: 40rem) {
    .settings-groups {
      flex-direction: column;
    }
  }
  .settings-groups button {
    padding: .4rem .7rem;
    border: 0;
    border-radius: var(--radius-md);
    background: none;
    color: var(--ink-2);
    font: inherit;
    font-size: var(--text-sm);
    font-weight: 600;
    text-align: left;
    white-space: nowrap;
    cursor: pointer;
  }
  .settings-groups button:hover {
    background: var(--surface-2);
    color: var(--ink);
  }
  .settings-groups button[aria-current] {
    background: var(--surface);
    box-shadow: inset 0 0 0 1px var(--line);
    color: var(--ink);
  }
  .settings-form .field.is-dirty {
    padding-left: .75rem;
    margin-left: -.75rem;
    border-left: 2px solid var(--warning);
  }
  .settings-actions {
    position: sticky;
    bottom: 0;
    display: flex;
    gap: .5rem;
    margin: 0 -1.1rem -1.1rem;
    padding: .85rem 1.1rem;
    border-top: 1px solid var(--line);
    border-radius: 0 0 var(--radius-lg) var(--radius-lg);
    background: var(--surface);
  }
</style>
