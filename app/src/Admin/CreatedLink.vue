<template lang="pug">
  .alert.alert-success.created-link(role="status")
    icon(name="check")
    .min-w-0.flex-1
      p {{ text }}
      .flex.flex-wrap.items-center.gap-2.mt-2(v-if="link")
        code.mono.text-sm.min-w-0.break-all {{ link }}
        clipboard.btn-sm(:value="link")
</template>

<script>
  import Clipboard from '../common/Clipboard.vue';

  // the one-time link after creating an account, an invitation or a reset
  export default {
    name: 'CreatedLink',
    components: { Clipboard },
    props: { text: String, link: String },
  };
</script>
