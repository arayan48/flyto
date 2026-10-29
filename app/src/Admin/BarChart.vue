<template lang="pug">
  figure.bar-chart
    figcaption.bar-chart-title
      strong {{ title }}
      span.muted(v-if="subtitle")  · {{ subtitle }}
    .bar-chart-plot(@mouseleave="hover = null")
      svg(:viewBox="`0 0 ${width} ${height}`", :width="width", :height="height", role="img", :aria-label="title")
        g(v-for="tick in ticks", :key="'t' + tick")
          line.grid(:x1="padLeft", :x2="width", :y1="y(tick)", :y2="y(tick)")
          text.axis(:x="padLeft - 6", :y="y(tick) + 4", text-anchor="end") {{ format(tick) }}
        g(v-for="(v, i) in values", :key="i")
          rect.hit(:x="padLeft + i * band", y="0", :width="band", :height="height - padBottom",
            @mouseenter="hover = i")
          path.bar(v-if="v > 0", :d="barPath(i, v)", :class="{dim: hover !== null && hover !== i}")
        text.axis(v-for="i in labelIndexes", :key="'l' + i", :x="padLeft + i * band + band / 2", :y="height - 4",
          text-anchor="middle") {{ shortDay(labels[i]) }}
      .bar-chart-tip(v-if="hover !== null", :style="tipStyle")
        div {{ labels[hover] }}
        strong {{ format(values[hover], true) }}
        div.muted(v-if="extra && extra[hover]") {{ extra[hover] }}
    table.sr-only
      caption {{ title }}
      tr(v-for="(v, i) in values", :key="'r' + i")
        th {{ labels[i] }}
        td {{ format(v, true) }}
</template>

<script>
  // one series per chart, in the brand blue: the title names it, no legend needed
  export default {
    name: 'BarChart',
    props: {
      title: String,
      subtitle: String,
      labels: Array,
      values: Array,
      extra: Array,
      formatter: Function,
    },
    data() {
      return { width: 600, height: 180, padLeft: 44, padBottom: 22, hover: null };
    },
    computed: {
      max() {
        return Math.max(1, ...this.values);
      },
      ticks() {
        const raw = this.max / 3;
        const mag = Math.pow(10, Math.floor(Math.log10(raw)));
        const step = [1, 2, 2.5, 5, 10].map(m => m * mag).find(s => s >= raw) || raw;
        const top = Math.ceil(this.max / step) * step;
        const out = [];
        for (let t = 0; t <= top + 1e-9; t += step) out.push(Math.round(t * 100) / 100);
        return out;
      },
      top() {
        return this.ticks[this.ticks.length - 1] || 1;
      },
      band() {
        return (this.width - this.padLeft) / Math.max(1, this.values.length);
      },
      labelIndexes() {
        const n = this.values.length;
        const every = Math.ceil(n / 6);
        const out = [];
        for (let i = 0; i < n; i += every) out.push(i);
        if (out[out.length - 1] !== n - 1) out.push(n - 1);
        return out;
      },
      tipStyle() {
        const left = (this.padLeft + this.hover * this.band + this.band / 2) / this.width * 100;
        return { left: `${ Math.min(85, Math.max(15, left)) }%` };
      },
    },
    mounted() {
      this.measure();
      this.onResize = () => this.measure();
      window.addEventListener('resize', this.onResize);
    },
    beforeUnmount() {
      window.removeEventListener('resize', this.onResize);
    },
    methods: {
      measure() {
        const w = this.$el.querySelector('.bar-chart-plot').clientWidth;
        if (w) this.width = w;
      },
      y(v) {
        return (this.height - this.padBottom) - v / this.top * (this.height - this.padBottom - 8);
      },
      // 4px rounded top, square on the baseline, 2px air between neighbours
      barPath(i, v) {
        const w = Math.min(24, Math.max(2, this.band - 2));
        const x = this.padLeft + i * this.band + (this.band - w) / 2;
        const base = this.height - this.padBottom;
        const top = Math.min(this.y(v), base - 1);
        const r = Math.min(4, w / 2, base - top);
        return `M${ x },${ base } V${ top + r } Q${ x },${ top } ${ x + r },${ top } H${ x + w - r } ` +
          `Q${ x + w },${ top } ${ x + w },${ top + r } V${ base } Z`;
      },
      format(v, full) {
        if (this.formatter) return this.formatter(v, full);
        if (!full && v >= 1000) return Math.round(v / 100) / 10 + 'K';
        return String(v);
      },
      shortDay(day) {
        return day ? day.slice(5).replace('-', '/') : '';
      },
    },
  };
</script>

<style>
  .bar-chart {
    margin: 0;
  }
  .bar-chart-title {
    display: flex;
    flex-wrap: wrap;
    gap: .25rem;
    margin-bottom: .75rem;
    font-size: var(--text-sm);
  }
  .bar-chart-plot {
    position: relative;
  }
  .bar-chart svg {
    display: block;
    max-width: 100%;
    height: auto;
    overflow: visible;
  }
  .bar-chart .grid {
    stroke: var(--line);
    stroke-width: 1;
    shape-rendering: crispEdges;
  }
  .bar-chart .axis {
    fill: var(--ink-3);
    font-family: var(--font-sans);
    font-size: 11px;
  }
  .bar-chart .bar {
    fill: var(--accent);
    transition: opacity .1s;
  }
  .bar-chart .bar.dim {
    opacity: .4;
  }
  .bar-chart .hit {
    fill: transparent;
  }
  .bar-chart-tip {
    position: absolute;
    top: 0;
    transform: translateX(-50%);
    padding: .3rem .55rem;
    border: 1px solid var(--line);
    border-radius: var(--radius-sm);
    background: var(--surface);
    box-shadow: var(--shadow-pop);
    font-size: var(--text-xs);
    line-height: 1.4;
    white-space: nowrap;
    pointer-events: none;
  }
</style>
