<template lang="pug">
  table.table.table-condensed.admin-table
    tbody
      tr(v-if="!items.length")
        td.text-muted {{ $t('admin.empty') }}
      tr(v-for="e in items", :key="e.id")
        td(style="white-space: nowrap") {{ e.at | date }}
        td
          span.label(:class="labelClass(e.action)") {{ actionLabel(e.action) }}
        td
          a(v-if="e.actorId", :href="'#/users/' + e.actorId") {{ e.actorEmail }}
          span.text-muted(v-else) {{ e.actorEmail || '–' }}
        td
          a(v-if="e.targetType === 'user' && e.targetId", :href="'#/users/' + e.targetId") {{ $t('admin.audit.user') }} {{ e.targetId }}
          a(v-else-if="e.targetType === 'transfer' && e.targetId", :href="'#/transfers/' + e.targetId") {{ e.targetId }}
          span(v-else-if="e.targetId") {{ e.targetType }} {{ e.targetId }}
        td.small.text-muted.break-all {{ summary(e.details) }}
        td.small.text-muted {{ e.ip }}
</template>

<script>
  export default {
    name: 'AuditTable',
    props: { items: { type: Array, default: () => [] } },
    methods: {
      actionLabel(action) {
        const labels = (this.$root.lang.admin && this.$root.lang.admin.actions) || {};
        return labels[action] || action;
      },
      labelClass(action) {
        if (/failed|locked|deleted|suspended|revoked/.test(action)) return 'label-danger';
        if (/^admin\./.test(action)) return 'label-primary';
        if (/^auth\.login$|register|created|enabled/.test(action)) return 'label-success';
        return 'label-default';
      },
      summary(details) {
        if (!details || !Object.keys(details).length) return '';
        return Object.entries(details).map(([k, v]) => {
          if (k === 'changed' && v && typeof v === 'object') return Object.keys(v).join(', ');
          if (Array.isArray(v)) return `${ k }: ${ v.length }`;
          if (v && typeof v === 'object') return `${ k }: …`;
          return `${ k }: ${ v }`;
        }).join(' · ').slice(0, 200);
      },
    },
  };
</script>
