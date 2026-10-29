<template lang="pug">
  .input-group
    input.form-control(type="number", min="0", step="any", :value="parts.value", :placeholder="placeholder",
      @input="emit($event.target.value, parts.unit)")
    span.input-group-btn(style="width: 80px")
      select.form-control(:value="parts.unit", @change="emit(parts.value, $event.target.value)")
        option(v-for="u in units", :value="u") {{ u }}
</template>

<script>
  import { UNITS, splitBytes } from '../common/format';

  // bytes in and out, MB/GB/TB on screen; null means "empty"
  export default {
    name: 'ByteInput',
    props: { modelValue: { default: null }, placeholder: String },
    emits: ['update:modelValue'],
    data() {
      return { units: Object.keys(UNITS), unit: splitBytes(this.modelValue).unit };
    },
    computed: {
      parts() {
        if (this.modelValue === null || this.modelValue === undefined || this.modelValue === '') return { value: '', unit: this.unit };
        const s = splitBytes(this.modelValue);
        return this.modelValue === 0 ? { value: 0, unit: this.unit } : s;
      },
    },
    methods: {
      emit(value, unit) {
        this.unit = unit;
        if (value === '' || value === null) return this.$emit('update:modelValue', null);
        this.$emit('update:modelValue', Math.round(+value * UNITS[unit]));
      },
    },
  };
</script>
