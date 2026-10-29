<template>
  <!-- round badge whose text turns around an arrow, like the stamp of a departure -->
  <span class="spin-badge" aria-hidden="true">
    <svg viewBox="0 0 120 120">
      <defs>
        <path :id="pathId" d="M60,60 m-44,0 a44,44 0 1,1 88,0 a44,44 0 1,1 -88,0" />
      </defs>
      <text>
        <textPath :href="'#' + pathId" textLength="272" lengthAdjust="spacing">{{ text }}</textPath>
      </text>
    </svg>
    <icon name="arrow-up-right" />
  </span>
</template>

<script>
  let seq = 0;

  export default {
    name: 'SpinBadge',
    props: { text: { type: String, required: true } },
    data() {
      return { pathId: 'spin-badge-' + ++seq };
    },
  };
</script>

<style>
  .spin-badge {
    position: relative;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    aspect-ratio: 1;
    border-radius: 50%;
    background: var(--ink);
    color: var(--sky);
    font-size: 1.15rem;
  }
  .spin-badge svg {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    animation: spin-badge 14s linear infinite;
  }
  .spin-badge text {
    fill: currentColor;
    font-family: var(--font-sans);
    font-size: 10.5px;
    font-weight: 650;
    letter-spacing: .18em;
    text-transform: uppercase;
  }
  .spin-badge > .icon {
    color: var(--bg);
    transition: transform .3s ease-out;
  }
  *:hover > .spin-badge > .icon {
    transform: rotate(45deg);
  }
  @keyframes spin-badge {
    to {
      transform: rotate(360deg);
    }
  }
</style>
