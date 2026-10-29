<template>
  <!-- progress bar ridden by the corner of the logo, while something is on its way -->
  <div class="flight-bar" :class="{ 'is-done': percent >= 100 }" role="progressbar" :aria-valuenow="Math.round(percent)"
    aria-valuemin="0" aria-valuemax="100">
    <div class="flight-bar-track">
      <span class="flight-bar-fill" :style="{ width: clamped + '%' }" />
    </div>
    <svg class="flight-bar-flap" :style="{ left: clamped + '%' }" viewBox="0 0 34 38" aria-hidden="true">
      <path d="M0.24 4.24Q-4 0 2 0L28.2 0Q34.2 0 34.2 6L34.2 32.2Q34.2 38.2 29.96 33.96Z" />
    </svg>
  </div>
</template>

<script>
  export default {
    name: 'FlightBar',
    props: { percent: { type: Number, default: 0 } },
    computed: {
      clamped() {
        return Math.max(0, Math.min(100, this.percent || 0));
      },
    },
  };
</script>

<style>
  .flight-bar {
    position: relative;
    padding-top: 1rem;
  }
  .flight-bar-track {
    height: 10px;
    border-radius: var(--radius-full);
    background: color-mix(in srgb, var(--sky) 35%, var(--surface-2));
    overflow: hidden;
  }
  .flight-bar-fill {
    display: block;
    height: 100%;
    border-radius: inherit;
    background-color: var(--accent);
    background-image: repeating-linear-gradient(-45deg, rgb(255 255 255 / .18) 0 8px, transparent 8px 16px);
    background-size: 22.6px 22.6px;
    transition: width .4s ease-out;
    animation: flight-bar-stripes .8s linear infinite;
  }
  .flight-bar-flap {
    position: absolute;
    top: 0;
    width: 1rem;
    margin-left: -.3rem;
    fill: var(--sky);
    filter: drop-shadow(0 2px 2px rgb(14 20 32 / .2));
    transition: left .4s ease-out;
    animation: flight-bar-bob 1.1s ease-in-out infinite alternate;
  }
  .flight-bar.is-done .flight-bar-fill {
    animation: none;
  }
  .flight-bar.is-done .flight-bar-flap {
    animation: flight-bar-away .6s cubic-bezier(.5, 0, .75, 0) forwards;
  }
  @keyframes flight-bar-stripes {
    to {
      background-position: 22.6px 0;
    }
  }
  @keyframes flight-bar-bob {
    from {
      transform: translateY(1px) rotate(-6deg);
    }
    to {
      transform: translateY(-3px) rotate(6deg);
    }
  }
  @keyframes flight-bar-away {
    to {
      opacity: 0;
      transform: translate(40px, -40px) rotate(30deg);
    }
  }
</style>
