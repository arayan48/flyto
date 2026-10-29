<template lang="pug">
  table.table.table-hover.admin-table
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
        td.text-muted(colspan="7") {{ $t('admin.empty') }}
      tr.clickable(v-for="t in items", :key="t.sid", @click="open(t)", :class="{danger: t.suspendedAt}")
        td(v-if="selectable", @click.stop="")
          input(type="checkbox", :checked="selected.includes(t.sid)", @change="toggle(t.sid, $event.target.checked)")
        td
          span.mono {{ t.sid }}
          |
          small.text-muted {{ t.files }} {{ $t('admin.users.filesShort') }}
          br
          span.label.label-default(v-if="t.password") {{ $t('admin.transfers.status.protected') }}
          span.label.label-info(v-if="t.oneTime") {{ $t('admin.transfers.status.oneTime') }}
          span.label.label-warning(v-if="t.partial") {{ $t('admin.transfers.status.partial') }}
          span.label.label-danger(v-if="t.suspendedAt", :title="t.suspendedReason") {{ $t('admin.transfers.status.suspended') }}
        td(v-if="showOwner")
          a(v-if="t.ownerId", :href="'admin#/users/' + t.ownerId", @click.stop="") {{ t.ownerEmail || '#' + t.ownerId }}
          span.text-muted(v-else) {{ $t('admin.transfers.anonymous') }}
        td {{ t.createdAt | date }}
        td
          template(v-if="t.oneTime") {{ $t('admin.transfers.status.oneTime') }}
          template(v-else) {{ t.expiresAt | date }}
        td.text-right {{ t.downloads }}
        td.text-right {{ t.size | size }}
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
