<template lang="pug">
  div
    .alert.alert-danger(v-if="error") {{ error }}
    template(v-if="stats")
      .alert.alert-warning(v-for="w in warnings", :key="w.key")
        | {{ w.text }}
        |
        a(v-if="w.href", :href="w.href") {{ w.link }}
        button.btn.btn-xs.btn-warning(v-if="w.action", @click="w.action", style="margin-left: 8px") {{ w.link }}

      .admin-toolbar
        span.text-muted.small {{ $t('admin.dashboard.generated', { date: $options.filters.date(stats.generatedAt) }) }}
        select.form-control.input-sm(v-model.number="days", @change="load")
          option(:value="7") {{ $t('admin.dashboard.days', { count: 7 }) }}
          option(:value="30") {{ $t('admin.dashboard.days', { count: 30 }) }}
          option(:value="90") {{ $t('admin.dashboard.days', { count: 90 }) }}
          option(:value="365") {{ $t('admin.dashboard.days', { count: 365 }) }}
        button.btn.btn-sm.btn-default(@click="load")
          icon(name="sync-alt")

      .row
        .col-sm-6.col-md-3(v-for="tile in tiles", :key="tile.label")
          a.stat-tile(:href="tile.href", style="display:block; color: inherit; text-decoration: none")
            .stat-label {{ tile.label }}
            .stat-value {{ tile.value }}
            .stat-sub {{ tile.sub }}
            .progress.usage-bar(v-if="tile.percent !== undefined")
              .progress-bar(:class="{'progress-bar-danger': tile.percent > 90, 'progress-bar-warning': tile.percent > 75 && tile.percent <= 90}",
                :style="{width: tile.percent + '%'}")

      .row
        .col-md-6
          bar-chart(:title="$t('admin.dashboard.uploadsChart')", :labels="stats.activity.days",
            :values="stats.activity.uploads.map(d => d.count)",
            :extra="stats.activity.uploads.map(d => sizeLabel(d.bytes))")
        .col-md-6
          bar-chart(:title="$t('admin.dashboard.volumeChart')", :labels="stats.activity.days",
            :values="stats.activity.uploads.map(d => d.bytes)", :formatter="sizeFormatter")
        .col-md-6
          bar-chart(:title="$t('admin.dashboard.downloadsChart')", :labels="stats.activity.days",
            :values="stats.activity.downloads.map(d => d.count)",
            :extra="stats.activity.downloads.map(d => sizeLabel(d.bytes))")
        .col-md-6
          bar-chart(:title="$t('admin.dashboard.signupsChart')", :labels="stats.activity.days",
            :values="stats.activity.signups")

      .row
        .col-md-6.admin-section
          h4 {{ $t('admin.dashboard.transfers') }}
          table.table.table-condensed.kv-table
            tbody
              tr(v-for="row in transferRows", :key="row.key")
                th {{ row.label }}
                td.text-right
                  a(:href="'admin#/transfers?status=' + row.key", v-if="row.link") {{ row.value }}
                  template(v-else) {{ row.value }}
          h4 {{ $t('admin.dashboard.totals') }}
          table.table.table-condensed.kv-table
            tbody
              tr
                th {{ $t('admin.dashboard.allUploads') }}
                td.text-right {{ stats.totals.uploads }} · {{ $size(stats.totals.uploadBytes) }}
              tr
                th {{ $t('admin.dashboard.allDownloads') }}
                td.text-right {{ stats.totals.downloads }} · {{ $size(stats.totals.downloadBytes) }}
        .col-md-6.admin-section
          h4 {{ $t('admin.dashboard.topUsers') }}
          p.text-muted(v-if="!stats.topUsers.length") {{ $t('admin.empty') }}
          table.table.table-condensed(v-else)
            tbody
              tr(v-for="u in stats.topUsers", :key="u.id")
                td
                  a(:href="'admin#/users/' + u.id") {{ u.name || u.email }}
                  br
                  small.text-muted(v-if="u.name") {{ u.email }}
                td.text-right {{ u.transfers }} {{ $t('admin.dashboard.transfersShort') }}
                td.text-right {{ $size(u.storage) }}

      .admin-section
        h4
          | {{ $t('admin.dashboard.recent') }}
          |
          small
            a(href="admin#/audit") {{ $t('admin.dashboard.seeAll') }}
        audit-table(:items="stats.recent")
    p.text-muted(v-else-if="!error")
      icon(name="spinner", spin="")
</template>

<script>
  import BarChart from './BarChart.vue';
  import AuditTable from './AuditTable.vue';
  import { get, patch } from '../common/api';
  import { humanFileSize } from '../common/format';

  export default {
    name: 'Dashboard',
    components: { BarChart, AuditTable },
    data() {
      return { stats: null, system: null, settings: null, error: '', days: 30 };
    },
    computed: {
      tiles() {
        const s = this.stats;
        const tiles = [
          { label: this.$t('admin.dashboard.users'), value: s.users.total, href: 'admin#/users',
            sub: this.$t('admin.dashboard.usersSub', { online: s.users.online, pending: s.users.pending, new30d: s.users.new30d }) },
          { label: this.$t('admin.dashboard.activeTransfers'), value: s.transfers.active, href: 'admin#/transfers',
            sub: this.$t('admin.dashboard.filesSub', { files: s.transfers.files }) },
          { label: this.$t('admin.dashboard.storage'), value: humanFileSize(s.transfers.storage), href: 'admin#/transfers',
            sub: s.disk ? this.$t('admin.dashboard.diskSub', { free: humanFileSize(s.disk.free), total: humanFileSize(s.disk.total) }) : '' },
          { label: this.$t('admin.dashboard.today'), value: this.today.uploads + ' / ' + this.today.downloads, href: 'admin#/downloads',
            sub: this.$t('admin.dashboard.todaySub') },
        ];
        if (s.disk && s.disk.total) tiles[2].percent = Math.round((s.disk.total - s.disk.free) / s.disk.total * 100);
        return tiles;
      },
      today() {
        const a = this.stats.activity;
        const last = a.days.length - 1;
        return { uploads: a.uploads[last].count, downloads: a.downloads[last].count };
      },
      transferRows() {
        const t = this.stats.transfers;
        return ['protected', 'oneTime', 'expiringSoon', 'partial', 'suspended', 'anonymous']
          .map(key => ({ key, label: this.$t('admin.transfers.status.' + key), value: t[key], link: false }));
      },
      warnings() {
        const list = [];
        const lang = this.$root.lang.admin.warnings;
        if (!this.settings) return list;
        const v = this.settings.values;
        if (v.maintenanceMode) list.push({ key: 'maintenance', text: lang.maintenance, link: lang.settingsLink, href: 'admin#/settings' });
        if (!v.publicUrl) {
          list.push({ key: 'publicUrl', text: lang.publicUrl.replace('{url}', this.$root.baseURI), link: lang.usePublicUrl,
            action: () => this.setPublicUrl() });
        }
        if (!this.settings.mail.enabled) list.push({ key: 'mail', text: lang.mail, link: lang.settingsLink, href: 'admin#/settings' });
        if (this.stats.users.pending) {
          list.push({ key: 'pending', text: lang.pending.replace('{count}', this.stats.users.pending), link: lang.review,
            href: 'admin#/users' });
        }
        const me = this.$root.session.user;
        if (me && !me.totpEnabled) list.push({ key: '2fa', text: lang.twoFactor, link: lang.enable, href: 'account#security' });
        if (this.system && this.system.update && this.system.update.updateAvailable) {
          list.push({ key: 'update', text: lang.update.replace('{version}', this.system.update.latest), link: lang.releaseNotes,
            href: this.system.update.url });
        }
        if (this.stats.disk && this.stats.disk.total && this.stats.disk.free / this.stats.disk.total < 0.1) {
          list.push({ key: 'disk', text: lang.disk.replace('{free}', humanFileSize(this.stats.disk.free)) });
        }
        return list;
      },
    },
    created() {
      this.load();
    },
    methods: {
      sizeLabel(bytes) {
        return humanFileSize(bytes || 0);
      },
      sizeFormatter(v) {
        return v ? humanFileSize(v) : '0';
      },
      async load() {
        this.error = '';
        try {
          [this.stats, this.system, this.settings] = await Promise.all([
            get('admin/stats?days=' + this.days),
            get('admin/system'),
            get('admin/settings'),
          ]);
        } catch (e) {
          this.error = this.$err(e);
        }
      },
      async setPublicUrl() {
        try {
          await patch('admin/settings', { publicUrl: this.$root.baseURI });
          await this.load();
        } catch (e) {
          this.error = this.$err(e);
        }
      },
    },
  };
</script>
