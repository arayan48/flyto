import { mountApp, baseURI } from './common/vue-setup';
import Admin from './Admin.vue';
import { httpGet } from './common/util';
import { get, setCsrf } from './common/api';

mountApp(Admin, {
  data() {
    return {
      baseURI: baseURI(),
      lang: {},
      session: null,
      error: '',
    };
  },
  async created() {
    try {
      this.lang = await httpGet('lang.json');
      this.session = await get('session');
      setCsrf(this.session.csrf);
    } catch (e) {
      this.error = e.message || String(e);
    }
  },
}).mount('#admin');
