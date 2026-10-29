<template lang="pug">
  div
    .usage.card.mb-6
      .usage-item(v-for="item in usage", :key="item.label")
        span.eyebrow {{ item.label }}
        span.usage-value.tnum
          | {{ item.value }}
          span.faint.font-normal(v-if="item.limit")  / {{ item.limit }}
        .progress.mt-2(v-if="item.percent !== null", :class="{ 'is-high': item.percent > 90 }")
          span(:style="{ width: Math.min(item.percent, 100) + '%' }")

    .flex.flex-wrap.items-center.justify-between.gap-3.mb-3
      h2.text-lg {{ $t('account.tabs.transfers') }}
      a.btn.btn-primary(:href="uploadUrl")
        icon(name="cloud-upload-alt")
        | {{ $root.lang.newUpload }}
    .alert.alert-danger.mb-4(v-if="error", role="alert") {{ error }}
    .card.card-body.muted(v-if="loaded && !transfers.length") {{ $t('account.noTransfers') }}

    .card.table-wrap(v-if="transfers.length")
      table.table
        thead
          tr
            th {{ $t('account.transfer') }}
            th {{ $t('account.created') }}
            th {{ $t('account.expires') }}
            th.num {{ $t('account.downloads') }}
            th.num {{ $t('account.size') }}
            th
              span.sr-only {{ $t('account.details') }}
        template(v-for="t in transfers", :key="t.sid")
          tbody
            tr
              td
                a.font-semibold(:href="t.url", target="_blank", rel="noopener") {{ t.items.length === 1 ? t.items[0].name : $t('account.files', { count: t.items.length }) }}
                .flex.flex-wrap.items-center.gap-1.mt-1
                  span.mono.text-xs.faint {{ t.sid }}
                  span.badge(v-if="t.password", :title="$root.lang.password")
                    icon(name="key")
                  span.badge.badge-accent(v-if="t.oneTime") {{ $root.lang.retentions['one-time'] }}
                  span.badge.badge-warning(v-if="t.partial") {{ $t('account.partial') }}
                  span.badge.badge-danger(v-if="t.suspendedAt", :title="t.suspendedReason") {{ $t('account.suspended') }}
              td.whitespace-nowrap {{ $date(t.createdAt) }}
              td.whitespace-nowrap
                template(v-if="t.oneTime") {{ $root.lang.retentions['one-time'] }}
                template(v-else) {{ $date(t.expiresAt) }}
              td.num {{ t.downloads }}
              td.num {{ $size(t.size) }}
              td.actions
                clipboard.btn-sm.btn-ghost(:value="t.url", :title="$root.lang.copyToClipboard", icon-only)
                button.btn.btn-sm.btn-ghost.btn-icon(type="button", @click="expanded = expanded === t.sid ? null : t.sid",
                  :title="$t('account.details')", :aria-label="$t('account.details')", :aria-expanded="expanded === t.sid")
                  icon(:name="expanded === t.sid ? 'chevron-up' : 'chevron-down'")
                button.btn.btn-sm.btn-ghost.btn-icon.btn-danger(type="button", @click="remove(t)",
                  :title="$t('account.delete')", :aria-label="$t('account.delete')")
                  icon(name="trash")
            template(v-if="expanded === t.sid")
              tr.sub-row(v-for="f in t.items", :key="f.key")
                td(colspan="3")
                  span.text-sm {{ f.name }}
                  span.badge.badge-warning.ml-2(v-if="f.partial") {{ $t('account.partial') }}
                td.num.text-sm {{ f.downloads }}
                td.num.text-sm {{ $size(f.size) }}
                td.actions
                  button.btn.btn-sm.btn-ghost.btn-icon(v-if="t.items.length > 1", type="button", @click="removeFile(t, f)",
                    :title="$t('account.deleteFile')", :aria-label="$t('account.deleteFile')")
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
