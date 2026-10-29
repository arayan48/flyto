<template lang="pug">
  div
    .row
      .col-sm-4(v-for="item in usage")
        .panel.panel-default
          .panel-body
            .text-muted.small {{ item.label }}
            div
              strong {{ item.value }}
              span.text-muted(v-if="item.limit")  / {{ item.limit }}
            .progress.usage-bar(v-if="item.percent !== null")
              .progress-bar(:class="{'progress-bar-danger': item.percent > 90, 'progress-bar-warning': item.percent > 75 && item.percent <= 90}",
                :style="{width: Math.min(item.percent, 100) + '%'}")
    p
      a.btn.btn-success(:href="uploadUrl")
        icon.fa-fw(name="cloud-upload-alt")
        |  {{ $root.lang.newUpload }}
    .alert.alert-danger(v-if="error") {{ error }}
    p.text-muted(v-if="loaded && !transfers.length") {{ $t('account.noTransfers') }}
    table.table.table-hover(v-if="transfers.length")
      thead
        tr
          th {{ $t('account.transfer') }}
          th {{ $t('account.created') }}
          th {{ $t('account.expires') }}
          th.text-right {{ $t('account.downloads') }}
          th.text-right {{ $t('account.size') }}
          th
      template(v-for="t in transfers", :key="t.sid")
        tbody
          tr
            td
              a(:href="t.url", target="_blank", rel="noopener") {{ t.items.length === 1 ? t.items[0].name : $t('account.files', { count: t.items.length }) }}
              br
              small.text-muted {{ t.sid }}
              icon.text-muted(name="key", v-if="t.password", :title="$root.lang.password")
              |
              span.label.label-info(v-if="t.oneTime") {{ $root.lang.retentions['one-time'] }}
              |
              span.label.label-warning(v-if="t.partial") {{ $t('account.partial') }}
              |
              span.label.label-danger(v-if="t.suspendedAt", :title="t.suspendedReason") {{ $t('account.suspended') }}
            td {{ $date(t.createdAt) }}
            td
              template(v-if="t.oneTime") {{ $root.lang.retentions['one-time'] }}
              template(v-else) {{ $date(t.expiresAt) }}
            td.text-right {{ t.downloads }}
            td.text-right {{ $size(t.size) }}
            td.table-actions
              clipboard.btn.btn-sm.btn-default(:value="t.url", :title="$root.lang.copyToClipboard", icon-only)
              button.btn.btn-sm.btn-default(@click="expanded = expanded === t.sid ? null : t.sid", :title="$t('account.details')")
                icon(:name="expanded === t.sid ? 'chevron-up' : 'chevron-down'")
              button.btn.btn-sm.btn-danger(@click="remove(t)", :title="$t('account.delete')")
                icon(name="trash")
          template(v-if="expanded === t.sid")
            tr(v-for="f in t.items", :key="f.key")
              td(colspan="3")
                small {{ f.name }}
                span.label.label-warning(v-if="f.partial")  {{ $t('account.partial') }}
              td.text-right
                small {{ f.downloads }}
              td.text-right
                small {{ $size(f.size) }}
              td.table-actions
                button.btn.btn-xs.btn-default(v-if="t.items.length > 1", @click="removeFile(t, f)", :title="$t('account.deleteFile')")
                  icon(name="times")
</template>

<script>
  import Clipboard from '../common/Clipboard.vue';
  import { get, del } from '../common/api';
  import { humanFileSize } from '../common/format';

  export default {
    name: 'MyTransfers',
    emits: ['changed'],
    components: { Clipboard },
    props: ['me'],
    data() {
      return { transfers: [], loaded: false, error: '', expanded: null };
    },
    computed: {
      uploadUrl() {
        return './';
      },
      usage() {
        const { usage, limits } = this.me;
        const pct = (v, l) => (l ? Math.round(v / l * 100) : null);
        return [
          { label: this.$t('account.storage'), value: humanFileSize(usage.storage),
            limit: limits.storage && humanFileSize(limits.storage), percent: pct(usage.storage, limits.storage) },
          { label: this.$t('account.activeTransfers'), value: usage.transfers,
            limit: limits.transfers, percent: pct(usage.transfers, limits.transfers) },
          { label: this.$t('account.perTransfer'), value: limits.transfer ? humanFileSize(limits.transfer) : this.$t('account.unlimited'),
            limit: null, percent: null },
        ];
      },
    },
    created() {
      this.load();
    },
    methods: {
      async load() {
        try {
          this.transfers = await get('me/transfers');
          this.loaded = true;
        } catch (e) {
          this.error = this.$err(e);
        }
      },
      async remove(t) {
        if (!confirm(this.$t('account.confirmDelete'))) return;
        try {
          await del('me/transfers/' + encodeURIComponent(t.sid));
          await this.load();
          this.$emit('changed');
        } catch (e) {
          this.error = this.$err(e);
        }
      },
      async removeFile(t, f) {
        if (!confirm(this.$t('account.confirmDeleteFile', { name: f.name }))) return;
        try {
          await del(`me/transfers/${ encodeURIComponent(t.sid) }/files/${ encodeURIComponent(f.key) }`);
          await this.load();
          this.$emit('changed');
        } catch (e) {
          this.error = this.$err(e);
        }
      },
    },
  };
</script>
