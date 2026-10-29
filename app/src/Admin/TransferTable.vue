<template lang="pug">
  .card.table-wrap
    table.table.admin-table
      thead
        tr
          th(v-if="selectable", style="width: 30px")
            input(type="checkbox", :checked="allSelected", @change="toggleAll($event.target.checked)")
          th {{ $t('admin.transfers.transfer') }}
          th(v-if="showOwner") {{ $t('admin.transfers.owner') }}
          th {{ $t('admin.transfers.created') }}
          th {{ $t('admin.transfers.expires') }}
          th.text-right {{ $t('admin.transfers.downloads') }}
          th.text-right {{ $t('admin.transfers.size') }}
      tbody
        tr(v-if="!items.length")
          td.muted(colspan="7") {{ $t('admin.empty') }}
        tr.clickable(v-for="t in items", :key="t.sid", @click="open(t)", :class="{ 'is-suspended': t.suspendedAt }")
          td(v-if="selectable", @click.stop="")
            input(type="checkbox", :checked="selected.includes(t.sid)", @change="toggle(t.sid, $event.target.checked)")
          td
            span.mono {{ t.sid }}
            small.muted.ml-2 {{ t.files }} {{ $t('admin.users.filesShort') }}
            br
            span.badge(v-if="t.password") {{ $t('admin.transfers.status.protected') }}
            span.badge.badge-accent(v-if="t.oneTime") {{ $t('admin.transfers.status.oneTime') }}
            span.badge.badge-warning(v-if="t.partial") {{ $t('admin.transfers.status.partial') }}
            span.badge.badge-danger(v-if="t.suspendedAt", :title="t.suspendedReason") {{ $t('admin.transfers.status.suspended') }}
          td(v-if="showOwner")
            a(v-if="t.ownerId", :href="'admin#/users/' + t.ownerId", @click.stop="") {{ t.ownerEmail || '#' + t.ownerId }}
            span.muted(v-else) {{ $t('admin.transfers.anonymous') }}
          td {{ $date(t.createdAt) }}
          td
            template(v-if="t.oneTime") {{ $t('admin.transfers.status.oneTime') }}
            template(v-else) {{ $date(t.expiresAt) }}
          td.text-right {{ t.downloads }}
          td.text-right {{ $size(t.size) }}
</template>

<script>
  export default {
    name: 'TransferTable',
    props: {
      items: { type: Array, default: () => [] },
      showOwner: { type: Boolean, default: true },
      selectable: Boolean,
      selected: { type: Array, default: () => [] },
    },
    computed: {
      allSelected() {
        return this.items.length > 0 && this.items.every(t => this.selected.includes(t.sid));
      },
    },
    methods: {
      open(t) {
        document.location.hash = '#/transfers/' + encodeURIComponent(t.sid);
      },
      toggle(sid, on) {
        const next = this.selected.filter(s => s !== sid);
        if (on) next.push(sid);
        this.$emit('select', next);
      },
      toggleAll(on) {
        this.$emit('select', on ? this.items.map(t => t.sid) : []);
      },
    },
  };
</script>
