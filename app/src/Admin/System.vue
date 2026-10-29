<template lang="pug">
  div
    .alert.alert-danger.mb-4(v-if="error", role="alert") {{ error }}
    .alert.alert-success.mb-4(v-if="message", role="status") {{ message }}
    .grid-2.system-grid(v-if="sys")
      div
        .admin-section
          h2.section-title {{ $t('admin.system.version') }}
          .card.kv-card
            table.kv-table
              tbody
                tr
                  th Flyto
                  td
                    | v{{ sys.version }}
                    |
                    span.badge.badge-warning(v-if="sys.update.updateAvailable") {{ $t('admin.system.updateTo', { version: sys.update.latest }) }}
                    span.badge.badge-success(v-else-if="sys.update.enabled && sys.update.checkedAt") {{ $root.lang.upToDate }}
                tr(v-if="sys.update.updateAvailable")
                  th
                  td
                    a(:href="sys.update.url", target="_blank", rel="noopener") {{ $root.lang.updateReleaseNotes }}
                    |  ·
                    a(:href="'https://github.com/' + sys.update.repo + '/blob/main/docs/updating.md'", target="_blank", rel="noopener") {{ $root.lang.updateHowTo }}
                tr
                  th {{ $t('admin.system.lastCheck') }}
                  td {{ sys.update.enabled ? $date(sys.update.checkedAt) : $t('admin.system.disabled') }}
                tr
                  th Node.js
                  td {{ sys.node }}
                tr
                  th {{ $t('admin.system.platform') }}
                  td {{ sys.platform }} · {{ sys.cpus }} CPU
                tr
                  th {{ $t('admin.system.uptime') }}
                  td {{ duration(sys.uptime) }} ({{ $date(sys.startedAt) }})
                tr
                  th {{ $t('admin.system.memory') }}
                  td {{ $size(sys.memory.rss) }} · heap {{ $size(sys.memory.heapUsed) }} / {{ $size(sys.memory.heapTotal) }}
                tr
                  th {{ $t('admin.system.load') }}
                  td {{ sys.load.map(l => l.toFixed(2)).join(' · ') }}
                tr
                  th {{ $t('admin.system.timezone') }}
                  td {{ sys.timezone }}
        .admin-section
          h2.section-title {{ $t('admin.system.storage') }}
          .card.kv-card
            table.kv-table
              tbody
                tr
                  th {{ $t('admin.system.uploadDir') }}
                  td.mono {{ sys.config.uploadDir }}
                tr(v-if="sys.disk")
                  th {{ $t('admin.system.disk') }}
                  td
                    | {{ $size(sys.disk.total - sys.disk.free) }} / {{ $size(sys.disk.total) }}
                    .progress.mt-2(:class="{ 'is-high': diskPercent > 90 }")
                      span(:style="{ width: diskPercent + '%' }")
        .admin-section
          h2.section-title {{ $t('admin.system.cache') }}
          .card.kv-card
            table.kv-table
              tbody
                tr
                  th {{ $t('admin.system.backend') }}
                  td
                    | {{ sys.cache.backend === 'redis' ? 'Redis' : $t('admin.system.memoryCache') }}
                    |
                    span.badge(:class="sys.cache.connected ? 'badge-success' : 'badge-danger'") {{ sys.cache.connected ? $t('admin.system.connected') : $t('admin.system.disconnected') }}
                tr(v-if="sys.cache.keys !== undefined")
                  th {{ $t('admin.system.keys') }}
                  td {{ sys.cache.keys }}
                tr(v-if="sys.cache.memory")
                  th {{ $t('admin.system.memory') }}
                  td {{ sys.cache.memory }}
      div
        .admin-section
          h2.section-title {{ $t('admin.system.database') }}
          .card.kv-card
            table.kv-table
              tbody
                tr
                  th {{ $t('admin.system.engine') }}
                  td {{ sys.database.version }}
                tr
                  th {{ $t('admin.system.dbSize') }}
                  td {{ $size(sys.database.size) }} ({{ sys.database.name }})
                tr
                  th {{ $t('admin.system.schema') }}
                  td v{{ sys.database.schemaVersion }}
          .card.table-wrap
            table.table
              thead
                tr
                  th {{ $t('admin.system.table') }}
                  th.text-right {{ $t('admin.system.rows') }}
                  th.text-right {{ $t('admin.transfers.size') }}
              tbody
                tr(v-for="t in sys.database.tables", :key="t.name")
                  td.mono {{ t.name }}
                  td.text-right {{ t.rows }}
                  td.text-right {{ $size(t.size) }}
        .admin-section
          h2.section-title {{ $t('admin.system.configuration') }}
          .card.kv-card
            table.kv-table
              tbody
                tr
                  th Base URL
                  td.mono {{ sys.config.baseUrl }}
                tr
                  th Port
                  td {{ sys.config.port }}
                tr
                  th Trust proxy
                  td {{ sys.config.trustProxy || '–' }}
                tr
                  th HTTPS
                  td {{ sys.config.forceHttps || '–' }}
                tr
                  th {{ $t('admin.system.maxAge') }}
                  td {{ duration(sys.config.maxAge) }}
                tr
                  th Redis
                  td {{ sys.config.redis ? '✓' : '–' }}
                tr
                  th SMTP (env)
                  td {{ sys.config.smtpFromEnv ? '✓' : '–' }}
                tr
                  th Webhooks
                  td {{ sys.config.webhooks.uploaded ? 'upload ✓' : '' }} {{ sys.config.webhooks.downloaded ? 'download ✓' : '' }}
                tr
                  th {{ $t('admin.system.languages') }}
                  td {{ sys.config.languages.length }} ({{ $t('admin.system.default') }} {{ sys.config.defaultLanguage }})

    .admin-section
      h2.section-title {{ $t('admin.system.maintenance') }}
      .card.table-wrap
        table.table.admin-table
          tbody
            tr(v-for="a in actions", :key="a.key")
              td
                strong {{ $t('admin.system.actions.' + a.key + '.title') }}
                br
                small.muted {{ $t('admin.system.actions.' + a.key + '.help') }}
                div(v-if="a.key === 'orphans' && orphans")
                  small
                    | {{ $t('admin.system.orphansFound', { files: orphans.files.length, missing: orphans.missing.length, directories: orphans.directories.length }) }}
                  ul.text-sm.muted(v-if="orphans.files.length || orphans.missing.length")
                    li(v-for="f in orphans.files.slice(0, 20)", :key="'f' + f.sid + f.name") {{ f.sid }}/{{ f.name }} ({{ $size(f.size) }})
                    li(v-for="f in orphans.missing.slice(0, 20)", :key="'m' + f.sid + f.key") {{ f.sid }} · {{ f.name }} ({{ $t('admin.system.missingFile') }})
              td.actions
                button.btn.btn-sm(v-if="a.key === 'orphans'", @click="scanOrphans", :disabled="busy") {{ $t('admin.system.scan') }}
                button.btn.btn-sm(:class="{ 'btn-danger': a.danger }", @click="runAction(a)", :disabled="busy") {{ $t('admin.system.run') }}
</template>

<script>
  import { get, post } from '../common/api';
  import { formatDuration } from '../common/format';

  export default {
    name: 'System',
    data() {
      return {
        sys: null, error: '', message: '', busy: false, orphans: null,
        actions: [
          { key: 'gc', path: 'gc' },
          { key: 'orphans', path: 'orphans', danger: true },
          { key: 'purge', path: 'purge' },
          { key: 'cache', path: 'cache' },
          { key: 'revoke', path: 'revoke-sessions', danger: true },
        ],
      };
    },
    computed: {
      diskPercent() {
        const d = this.sys.disk;
        return d && d.total ? Math.round((d.total - d.free) / d.total * 100) : 0;
      },
    },
    created() {
      this.load();
    },
    methods: {
      duration: formatDuration,
      async load() {
        try {
          this.sys = await get('admin/system');
        } catch (e) {
          this.error = this.$err(e);
        }
      },
      async scanOrphans() {
        this.busy = true;
        try {
          this.orphans = await get('admin/maintenance/orphans');
        } catch (e) {
          this.error = this.$err(e);
        } finally {
          this.busy = false;
        }
      },
      async runAction(a) {
        if (a.danger && !confirm(this.$t('admin.system.actions.' + a.key + '.confirm'))) return;
        this.busy = true;
        this.error = '';
        this.message = '';
        try {
          const res = await post('admin/maintenance/' + a.path);
          this.message = this.$t('admin.system.actions.' + a.key + '.done', res);
          if (a.key === 'orphans') this.orphans = null;
          await this.load();
        } catch (e) {
          this.error = this.$err(e);
        } finally {
          this.busy = false;
        }
      },
    },
  };
</script>
