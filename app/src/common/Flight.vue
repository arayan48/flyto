<template>
  <!-- the logo's corner leaving the file along a dashed flight path -->
  <svg class="flight" :class="{ 'is-moving': moving }" viewBox="0 0 420 300" aria-hidden="true">
    <path class="flight-trail" d="M120 205 C 170 120, 230 210, 285 130 S 350 50, 372 46" />
    <g class="flight-sheet" transform="translate(40 150) scale(1.15)">
      <path d="M0 10Q0 0 10 0L51.8 0Q61.8 0 68.87 7.07L92.93 31.13Q100 38.2 100 48.2L100 90Q100 100 90 100L10 100Q0 100 0 90Z" />
    </g>
    <g class="flight-flap">
      <path d="M0.24 4.24Q-4 0 2 0L28.2 0Q34.2 0 34.2 6L34.2 32.2Q34.2 38.2 29.96 33.96Z" />
    </g>
  </svg>
</template>

<script>
  export default {
    name: 'Flight',
    props: { moving: Boolean },
  };
</script>

<style>
  .flight {
    width: 100%;
    max-width: 28rem;
    margin-left: auto;
    overflow: visible;
  }
  .flight-trail {
    fill: none;
    stroke: rgb(255 255 255 / .7);
    stroke-width: 3;
    stroke-linecap: round;
    stroke-dasharray: 2 12;
    stroke-dashoffset: 0;
    animation: flight-draw 1.6s .3s cubic-bezier(.65, 0, .35, 1) both;
  }
  .flight-sheet path {
    fill: rgb(255 255 255 / .14);
    stroke: #fff;
    stroke-width: 3;
  }
  .flight-flap {
    transform: translate(352px, 30px) rotate(12deg);
    animation: flight-flap 1.6s .3s cubic-bezier(.65, 0, .35, 1) both;
  }
  .flight-flap path {
    fill: var(--sky);
  }
  /* while an upload runs, the corner keeps leaving the file */
  .flight.is-moving .flight-flap {
    animation: flight-flap 1.8s cubic-bezier(.65, 0, .35, 1) infinite;
  }
  .flight.is-moving .flight-trail {
    animation: flight-dash 1s linear infinite;
  }
  @keyframes flight-dash {
    to {
      stroke-dashoffset: -28;
    }
  }
  @keyframes flight-draw {
    from {
      clip-path: inset(0 100% 0 0);
    }
    to {
      clip-path: inset(0 0 0 0);
    }
  }
  @keyframes flight-flap {
    from {
      transform: translate(125px, 138px) rotate(0deg);
    }
  }
</style>
