<template lang="pug">
  div(v-if="config && config.retentions")
    .panel.panel-default(:class="{'panel-info': !disabled}")
      .panel-heading
        strong {{ $root.lang.settings }}
      .panel-body
        .form-group
          label(for='retention') {{ $root.lang.retention }}
          |
          select#retention.form-control(:value='retention', :disabled='disabled',
          @change="uploadStore.retention = $event.target.value")
            option(
              v-for='(label, seconds) in config.retentions'
              :value="seconds"
              :selected="seconds === retention"
            ) {{ $root.lang.retentions[seconds] || label }}
        div
          label(for='password') {{ $root.lang.password }}
          .input-group(:class="{'has-error': config.requireBucketPassword && !password}")
            input#password.form-control(
              type='text'
              :value='password'
              @input="uploadStore.password = $event.target.value"
              :disabled='disabled'
              :placeholder="config.requireBucketPassword ? $root.lang.required : $root.lang.optional"
              :required="config.requireBucketPassword"
            )
            span.input-group-addon(
              style='cursor: pointer'
              :title='$root.lang.generateRandomPassword'
              @click='generatePassword()'
              tabindex="0"
              role="button"
              @keydown.enter.prevent='generatePassword()'
              @keydown.space.prevent='generatePassword()'
            )
              icon(name="key")
</template>

<script type="text/babel">
  import { mapStores, mapState } from 'pinia';
  import { useUploadStore } from './store';

  const passGen = {
    _pattern: /[A-Z0-9_\-+!]/,
    _getRandomByte: function() {
      const result = new Uint8Array(1);
      let fixedcrypto = window.msCrypto;
      if (!fixedcrypto) {
        fixedcrypto = window.crypto;
      }
      fixedcrypto.getRandomValues(result);
      return result[0];
    },
    generate: function(length) {
      let fixedcrypto2 = window.msCrypto;
      if (!fixedcrypto2) {
        fixedcrypto2 = window.crypto;
      }
      if (!fixedcrypto2 || !fixedcrypto2.getRandomValues) return '';
      return Array.apply(null, { 'length': length }).map(function() {
        let result;
        while (true) {
          result = String.fromCharCode(this._getRandomByte());
          if (this._pattern.test(result)) return result;
        }
      }, this).join('');
    }
  };

  export default {
    name: 'Settings',

    computed: {
      ...mapStores(useUploadStore),
      ...mapState(useUploadStore, { config: 'config', disabled: 'inputsDisabled', retention: 'retention', password: 'password' }),
    },

    methods: {
      generatePassword() {
        if (this.disabled) return;
        this.uploadStore.password = passGen.generate(10);
      }
    }
  };
</script>
