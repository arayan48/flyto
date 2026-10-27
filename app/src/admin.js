import Vue, { baseURI } from './common/vue-setup';
import Admin from './Admin.vue';
import { httpGet } from './common/util';
import { get, setCsrf } from './common/api';

new Vue({
  el: '#admin',
  data: {
    baseURI: baseURI(),
    lang: {},
    session: null,
    error: '',
  },
  render: h => h(Admin),
  async beforeCreate() {
    try {
      this.lang = await httpGet('lang.json');
      this.session = await get('session');
      setCsrf(this.session.csrf);
    } catch (e) {
      this.error = e.message || String(e);
    }
  },
});

window.FLYTO_VERSION = FLYTO_VERSION;
