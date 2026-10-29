import { mountApp, baseURI } from './common/vue-setup';
import Account from './Account.vue';
import { httpGet } from './common/util';
import { get, setCsrf } from './common/api';

mountApp(Account, {
  data() {
    return {
      baseURI: baseURI(),
      page: window.FLYTO_PAGE || 'login',
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
  methods: {
    async refreshSession() {
      this.session = await get('session');
      setCsrf(this.session.csrf);
    },
    // where to go after a login: ?next= keeps to pages of this site
    goNext(fallback = './') {
      const match = /[?&]next=([^&]+)/.exec(document.location.search);
      const next = match ? decodeURIComponent(match[1]) : fallback;
      document.location.href = /^[a-z0-9/#?=&_.-]+$/i.test(next) && !next.startsWith('//') ? next.replace(/^\//, '') : fallback;
    },
  },
}).mount('#account');
