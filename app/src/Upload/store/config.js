import Vue from 'vue';
import { setCsrf } from '../../common/api';

export default {
  namespaced: true,

  state: {
    loginRequired: false,
    maintenance: false,
    user: null,
    csrf: null,
    limits: {},
    usage: null,
  },

  mutations: {
    SET(state, val) {
      for (let k in val) {
        Vue.set(state, k, val[k]);
      }
    }
  },

  actions: {
    fetch({commit}) {
      return new Promise((resolve) => {
        const xhr = new XMLHttpRequest();
        xhr.open('GET', 'config.json');
        xhr.onload = () => {
          if(xhr.status === 200) {
            try {
              const conf = JSON.parse(xhr.responseText);
              commit('SET', conf);
              setCsrf(conf.csrf);
              commit('upload/RETENTION', conf.defaultRetention, {root:true});
            }
            catch(e) {
              commit('ERROR', `Config parse Error: ${e.message}`, {root: true});
            }
          }
          else {
            commit('ERROR', `Config load error: ${xhr.status} ${xhr.statusText}`, {root: true});
          }
          resolve();
        };
        xhr.send();
      });
    }
  }
}
