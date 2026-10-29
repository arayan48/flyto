import { createPinia } from 'pinia';
import { mountApp, baseURI } from './common/vue-setup';
import Upload from './Upload.vue';
import { useUploadStore } from './Upload/store';
import { httpGet } from './common/util';

const pinia = createPinia();

mountApp(Upload, {
  data() {
    return {
      baseURI: baseURI().replace(/\/$/, ''),
      configFetched: false,
      lang: {},
    };
  },
  async created() {
    const store = useUploadStore(pinia);
    try {
      this.lang = await httpGet('lang.json');
      store.lang = this.lang;
    } catch (e) {
      alert(e);
    }
    await store.fetchConfig();
    this.configFetched = true;
  },
}).use(pinia).mount('#upload');
