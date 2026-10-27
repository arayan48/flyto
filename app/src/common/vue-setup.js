import "regenerator-runtime/runtime.js";
import Vue from 'vue';
import Icon from 'vue-awesome/components/Icon';
import { translate, errorMessage, formatDate, humanFileSize } from './format';

Vue.component('icon', Icon);

Vue.prototype.$t = function(key, vars) {
  return translate(this.$root.lang, key, vars);
};
Vue.prototype.$err = function(e) {
  return errorMessage(this.$root.lang, e);
};
Vue.filter('date', value => formatDate(value));
Vue.filter('day', value => formatDate(value, false));
Vue.filter('size', value => (value || value === 0 ? humanFileSize(value) : '–'));

export function baseURI() {
  return document.head.getElementsByTagName('base')[0].href;
}

export default Vue;
