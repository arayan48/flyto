<template lang="pug">
  .card-body.grid.gap-4(v-if="config && config.retentions")
    .field
      label.label(for="retention") {{ $root.lang.retention }}
      select#retention.select(:value="retention", :disabled="disabled", @change="uploadStore.retention = $event.target.value")
        option(v-for="(label, seconds) in config.retentions", :key="seconds", :value="seconds")
          | {{ $root.lang.retentions[seconds] || label }}
    .field
      label.label(for="password")
        | {{ $root.lang.password }}
        span.faint.font-normal  · {{ config.requireBucketPassword ? $root.lang.required : $root.lang.optional }}
      .input-group
        input#password.input.input-mono(
          type="text",
          :value="password",
          :disabled="disabled",
          :required="config.requireBucketPassword",
          :aria-invalid="config.requireBucketPassword && !password ? 'true' : null",
          autocomplete="off",
          spellcheck="false",
          @input="uploadStore.password = $event.target.value"
        )
        button.btn.btn-icon(type="button", :disabled="disabled", :title="$root.lang.generateRandomPassword",
          :aria-label="$root.lang.generateRandomPassword", @click="generatePassword()")
          icon(name="key")
      p.hint {{ $t('ui.upload.passwordHint') }}
</template>

<script>
  import { mapStores, mapState } from 'pinia';
  import { useUploadStore } from './store';

  // no look-alike characters, the password is often read out or copied by hand
  const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';

  function randomPassword(length) {
    // keep only bytes below a multiple of the alphabet size, so every character is as likely
    const limit = 256 - 256 % ALPHABET.length;
    let out = '';
    while (out.length < length) {
      for (const b of crypto.getRandomValues(new Uint8Array(length * 2))) {
        if (b < limit && out.length < length) out += ALPHABET[b % ALPHABET.length];
      }
    }
    return out;
  }

  export default {
    name: 'Settings',

    computed: {
      ...mapStores(useUploadStore),
      ...mapState(useUploadStore, { config: 'config', disabled: 'inputsDisabled', retention: 'retention', password: 'password' }),
    },

    methods: {
      generatePassword() {
        if (this.disabled) return;
        this.uploadStore.password = randomPassword(12);
      },
    },
  };
</script>
