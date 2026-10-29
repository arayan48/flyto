<template lang="pug">
  nav.pager(v-if="total > perPage", :aria-label="$t('ui.pages')")
    span.text-sm.faint.tnum {{ $t('admin.pager', { from: (page - 1) * perPage + 1, to: Math.min(total, page * perPage), total }) }}
    .flex.gap-1
      button.btn.btn-sm.btn-icon(type="button", :disabled="page <= 1", :aria-label="$t('ui.preview.previous')", @click="go(page - 1)")
        icon(name="arrow-left")
      button.btn.btn-sm.tnum(v-for="p in pages", :key="p", type="button", :class="{ 'btn-primary': p === page }",
        :aria-current="p === page ? 'page' : null", @click="go(p)") {{ p }}
      button.btn.btn-sm.btn-icon(type="button", :disabled="page >= last", :aria-label="$t('ui.preview.next')", @click="go(page + 1)")
        icon(name="arrow-right")
</template>

<script>
  export default {
    name: 'Pager',
    emits: ['change'],
    props: { page: Number, perPage: Number, total: Number },
    computed: {
      last() {
        return Math.max(1, Math.ceil(this.total / this.perPage));
      },
      pages() {
        const from = Math.max(1, Math.min(this.page - 2, this.last - 4));
        const out = [];
        for (let p = from; p <= Math.min(this.last, from + 4); p++) out.push(p);
        return out;
      },
    },
    methods: {
      go(p) {
        if (p < 1 || p > this.last || p === this.page) return;
        this.$emit('change', p);
      },
    },
  };
</script>

<style>
  .pager {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: .75rem;
    margin-top: 1rem;
  }
</style>
