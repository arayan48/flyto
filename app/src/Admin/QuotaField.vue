<template lang="pug">
  .form-group
    label {{ label }}
    .row
      .col-xs-5
        select.form-control(:value="mode", @change="setMode($event.target.value)")
          option(value="default") {{ $t('admin.quota.default') }}
          option(value="unlimited") {{ $t('admin.quota.unlimited') }}
          option(value="custom") {{ $t('admin.quota.custom') }}
      .col-xs-7(v-if="mode === 'custom'")
        byte-input(v-if="bytes", :model-value="modelValue", @update:model-value="v => $emit('update:modelValue', v || null)")
        input.form-control(v-else, type="number", min="1", :value="modelValue", @input="$emit('update:modelValue', +$event.target.value || null)")
      .col-xs-7.form-control-static.text-muted(v-else-if="mode === 'default'") {{ defaultLabel }}
</template>

<script>
  import ByteInput from './ByteInput.vue';
  import { humanFileSize } from '../common/format';

  // null follows the global setting, 0 is unlimited, a number replaces the setting
  export default {
    name: 'QuotaField',
    components: { ByteInput },
    emits: ['update:modelValue'],
    props: { modelValue: { default: null }, label: String, bytes: Boolean, globalValue: { default: null } },
    data() {
      return { custom: false };
    },
    computed: {
      mode() {
        if (this.modelValue === null || this.modelValue === undefined) return this.custom ? 'custom' : 'default';
        return this.modelValue === 0 ? 'unlimited' : 'custom';
      },
      defaultLabel() {
        if (!this.globalValue) return this.$t('admin.quota.unlimited');
        return this.bytes ? humanFileSize(this.globalValue) : String(this.globalValue);
      },
    },
    methods: {
      setMode(mode) {
        this.custom = mode === 'custom';
        if (mode === 'default') this.$emit('update:modelValue', null);
        else if (mode === 'unlimited') this.$emit('update:modelValue', 0);
        else this.$emit('update:modelValue', this.globalValue || (this.bytes ? Math.pow(2, 30) * 10 : 10));
      },
    },
  };
</script>
