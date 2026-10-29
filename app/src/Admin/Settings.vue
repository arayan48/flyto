<template lang="pug">
  div(v-if="schema")
    .row
      .col-sm-3
        ul.nav.nav-pills.nav-stacked
          li(v-for="g in groupNames", :class="{active: group === g}")
            a(href="#", @click.prevent="group = g") {{ $t('admin.settings.groups.' + g) }}
      .col-sm-9
        .alert.alert-danger(v-if="error") {{ error }}
        .alert.alert-success(v-if="message") {{ message }}
        form(@submit.prevent="save")
          .form-group(v-for="key in groups[group]", :key="key", :class="{'has-warning': dirty(key)}")
            template(v-if="schema[key].type === 'boolean'")
              .checkbox
                label
                  input(type="checkbox", v-model="values[key]")
                  |  {{ label(key) }}
            template(v-else)
              label(:for="'s-' + key") {{ label(key) }}
              textarea.form-control(v-if="textareas.includes(key)", :id="'s-' + key", v-model="values[key]", rows="3")
              byte-input(v-else-if="bytes.includes(key)", :model-value="values[key] || null",
                @update:model-value="v => values[key] = v || 0", :placeholder="$t('admin.quota.unlimited')")
              select.form-control(v-else-if="schema[key].type === 'enum'", :id="'s-' + key", v-model="values[key]")
                option(v-for="v in enumValues(key)", :value="v") {{ enumLabel(key, v) }}
              div(v-else-if="schema[key].type === 'list'")
                label.checkbox-inline(v-for="v in schema[key].values", :key="v", style="margin-left: 0; margin-right: 15px")
                  input(type="checkbox", :value="v", v-model="values[key]")
                  |  {{ enumLabel(key, v) }}
              input.form-control(v-else-if="schema[key].type === 'integer'", :id="'s-' + key", type="number",
                v-model.number="values[key]", :min="schema[key].min", :max="schema[key].max")
              input.form-control(v-else, :id="'s-' + key", :type="schema[key].type === 'secret' ? 'password' : 'text'",
                v-model="values[key]", autocomplete="off")
            p.help-block(v-if="help(key)") {{ help(key) }}
            p.help-block.small(v-if="isCustom(key)")
              a(href="#", @click.prevent="reset(key)") {{ $t('admin.settings.resetDefault') }}

          template(v-if="group === 'email'")
            p.text-muted(v-if="mail.fromEnv") {{ $t('admin.settings.smtpFromEnv') }}
            .form-group
              .input-group
                input.form-control(type="email", v-model.trim="testTo", :placeholder="$root.session.user.email")
                span.input-group-btn
                  button.btn.btn-default(type="button", @click="testEmail", :disabled="testing") {{ $t('admin.settings.testEmail') }}

          button.btn.btn-primary(type="submit", :disabled="busy || !changedKeys.length")
            | {{ $t('admin.settings.save') }}
            template(v-if="changedKeys.length")  ({{ changedKeys.length }})
          |
          button.btn.btn-default(type="button", v-if="changedKeys.length", @click="load") {{ $t('admin.cancel') }}
</template>

<script>
  import ByteInput from './ByteInput.vue';
  import { get, patch, post } from '../common/api';

  const GROUPS = {
    general: ['siteName', 'siteDescription', 'publicUrl', 'contactEmail', 'termsUrl', 'privacyUrl'],
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
        textareas: ['siteDescription', 'announcementText', 'maintenanceMessage', 'allowedEmailDomains', 'blockedExtensions'],
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
