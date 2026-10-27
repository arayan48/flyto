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
    props: { value: { default: null }, placeholder: String },
    data() {
      return { units: Object.keys(UNITS), unit: splitBytes(this.value).unit };
    },
    computed: {
      parts() {
        if (this.value === null || this.value === undefined || this.value === '') return { value: '', unit: this.unit };
        const s = splitBytes(this.value);
        return this.value === 0 ? { value: 0, unit: this.unit } : s;
      },
    },
    methods: {
      emit(value, unit) {
        this.unit = unit;
        if (value === '' || value === null) return this.$emit('input', null);
        this.$emit('input', Math.round(+value * UNITS[unit]));
      },
    },
  };
</script>
