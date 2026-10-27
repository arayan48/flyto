<template lang="pug">
  .admin-pager.clearfix(v-if="total > perPage")
    span.text-muted.small {{ $t('admin.pager', { from: (page - 1) * perPage + 1, to: Math.min(total, page * perPage), total }) }}
    ul.pagination.pagination-sm.pull-right(style="margin: 0")
      li(:class="{disabled: page <= 1}")
        a(href="#", @click.prevent="go(page - 1)") ‹
      li(v-for="p in pages", :key="p", :class="{active: p === page}")
        a(href="#", @click.prevent="go(p)") {{ p }}
      li(:class="{disabled: page >= last}")
        a(href="#", @click.prevent="go(page + 1)") ›
</template>

<script>
  export default {
    name: 'Pager',
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
