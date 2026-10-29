import { mountApp, baseURI } from './common/vue-setup';
import Download from './Download.vue';
import { httpGet } from './common/util';

mountApp(Download, {
  data() {
    return {
      baseURI: baseURI().replace(/\/$/, ''),
      lang: {},
    };
  },
  async created() {
    try {
      this.lang = await httpGet('lang.json');
    } catch (e) {
      alert(e);
    }
  },
}).mount('#download');
