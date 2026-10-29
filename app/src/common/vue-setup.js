import { createApp, h } from 'vue';
import './theme.css';
import Icon from './Icon.vue';
import { translate, errorMessage, formatDate, humanFileSize } from './format';

export function baseURI() {
  return document.head.getElementsByTagName('base')[0].href;
}

/**
 * One app per page: the root holds lang and page state, read by components as $root.
 */
export function mountApp(component, root) {
  const app = createApp({ ...root, render: () => h(component) });
  app.component('icon', Icon);
  const g = app.config.globalProperties;
  g.$t = function(key, vars) {
    return translate(this.$root.lang, key, vars);
  };
  g.$err = function(e) {
    return errorMessage(this.$root.lang, e);
  };
  g.$date = value => formatDate(value);
  g.$day = value => formatDate(value, false);
  g.$size = value => (value || value === 0 ? humanFileSize(value) : '–');
  window.FLYTO_VERSION = FLYTO_VERSION;
  return app;
}
