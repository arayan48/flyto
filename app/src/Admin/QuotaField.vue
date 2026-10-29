<template lang="pug">
  fieldset.field
    legend.label.mb-1 {{ label }}
    .quota-row
      select.select(:value="mode", :aria-label="label", @change="setMode($event.target.value)")
        option(value="default") {{ $t('admin.quota.default') }}
        option(value="unlimited") {{ $t('admin.quota.unlimited') }}
        option(value="custom") {{ $t('admin.quota.custom') }}
      template(v-if="mode === 'custom'")
        byte-input(v-if="bytes", :model-value="modelValue", @update:model-value="v => $emit('update:modelValue', v || null)")
        input.input(v-else, type="number", min="1", :value="modelValue", :aria-label="label",
          @input="$emit('update:modelValue', +$event.target.value || null)")
      span.text-sm.faint.self-center(v-else-if="mode === 'default'") {{ defaultLabel }}
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

<style>
  .quota-row {
    display: grid;
    gap: .5rem;
  }
  @media (min-width: 40rem) {
    .quota-row {
      grid-template-columns: 11rem minmax(0, 1fr);
    }
  }
</style>
