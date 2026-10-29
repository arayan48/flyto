import { defineStore } from 'pinia';
import * as tus from 'tus-js-client';
import { setCsrf } from '../common/api';
import { humanFileSize } from '../common/format';

let onOnlineHandler = null;
let fileSeq = 0;
let onOnlineHandlerAttached = false;

function randomSid() {
  const bytes = new Uint8Array(6); // 12 hex chars
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

export const useUploadStore = defineStore('upload', {
  state: () => ({
    error: '',
    // disable all input fields
    inputsDisabled: false,
    /* States:
     * new: can modify settings and add/remove files
     * uploading: probably let user pause/cancel upload
     * uploaded: show download link
     * uploadError: show retry btn */
    state: 'new',
    lang: {},
    config: {
      loginRequired: false,
      maintenance: false,
      user: null,
      csrf: null,
      limits: {},
      usage: null,
    },
    retention: null,
    password: '',
    files: [],
    sid: randomSid(),
    uploadURI: (window.FLYTO_UPLOAD_PATH || '/') + 'files',
  }),

  getters: {
    shareUrl: state => document.head.getElementsByTagName('base')[0].href + state.sid,
    bytesUploaded: state => state.files.reduce((sum, file) => sum + file.progress.bytesUploaded, 0),
    bucketSize: state => state.files.reduce((sum, file) => sum + file._File.size, 0),
    percentUploaded() {
      return Math.min(Math.round(this.bytesUploaded / this.bucketSize * 100), 100);
    },
    bucketSizeError() {
      const maxBucketSize = this.config.maxBucketSize;
      if (!maxBucketSize || this.bucketSize <= maxBucketSize) return false;
      return this.lang.bucketSizeExceed
        .replace('%%', humanFileSize(this.bucketSize))
        .replace('%%', humanFileSize(maxBucketSize));
    },
    uploadError() {
      return this.error || this.bucketSizeError;
    },
    disabled() {
      return !!this.uploadError || this.inputsDisabled;
    },
  },

  actions: {
    setError(msg) {
      this.error = msg;
      this.inputsDisabled = true;
    },

    setState(val) {
      this.state = val;
      if (val !== 'new') this.inputsDisabled = true;
    },

    async fetchConfig() {
      try {
        const res = await fetch('config.json', { credentials: 'same-origin' });
        if (!res.ok) return this.setError(`Config load error: ${ res.status } ${ res.statusText }`);
        const conf = await res.json();
        Object.assign(this.config, conf);
        setCsrf(conf.csrf);
        this.retention = conf.defaultRetention;
      } catch (e) {
        this.setError(`Config parse Error: ${ e.message }`);
      }
    },

    addFiles(files) {
      if (this.inputsDisabled) return;
      const blocked = String(this.config.blockedExtensions || '').split(/[\s,;]+/)
        .map(e => e.trim().toLowerCase().replace(/^\./, '')).filter(Boolean);
      for (let i = 0; i < files.length; i++) {
        let error = false;
        const { maxFileSize, maxFiles } = this.config;
        const ext = blocked.find(e => files[i].name.toLowerCase().endsWith('.' + e));
        if (maxFileSize && files[i].size > maxFileSize) {
          error = this.lang.fileSizeExceed
            .replace('%%', humanFileSize(files[i].size))
            .replace('%%', humanFileSize(maxFileSize));
        } else if (ext) {
          error = this.lang.errors.blockedExtension.replace('{extension}', ext);
        } else if (maxFiles && this.files.length >= maxFiles) {
          error = this.lang.errors.tooManyFiles.replace('{limit}', maxFiles);
        }
        // wrap, don't change the HTML5-File-API object
        this.files.splice(0, 0, {
          id: ++fileSeq,
          _File: files[i],
          name: files[i].name,
          comment: '',
          progress: { percentage: 0, humanSize: 0, bytesUploaded: 0 },
          uploaded: false,
          error,
          humanSize: humanFileSize(files[i].size),
          _retryDelay: 500,
          _retries: 0,
        });
      }
    },

    removeFile(file) {
      const index = this.files.indexOf(file);
      if (index > -1) this.files.splice(index, 1);
    },

    upload() {
      this.setState('uploading');
      this.setError('');

      if (onOnlineHandler === null) {
        onOnlineHandler = () => {
          onOnlineHandlerAttached = false;
          this.setError(false);
          this.upload();
        };
      }
      if (onOnlineHandlerAttached) window.removeEventListener('online', onOnlineHandler);

      // once no file is in flight: share what got through, refused files keep their error
      const settle = () => {
        if (this.files.some(f => !f.uploaded && !f.error)) return;
        if (this.files.some(f => f.uploaded)) {
          fetch(this.uploadURI + '/' + this.sid + '?lock=yes', {
            method: 'PATCH',
            headers: { 'x-csrf-token': this.config.csrf || '' },
          });
          this.setState('uploaded');
        } else {
          this.setState('uploadError');
          this.setError(this.lang.uploadFailed);
        }
      };

      // upload all files in parallel
      this.files.forEach(file => {
        if (file.uploaded) return;
        file.error = '';
        file._retries = 0;
        file._retryDelay = 500;

        const startTusUpload = () => {
          new tus.Upload(file._File, {
            uploadUrl: file._uploadUrl,
            metadata: {
              sid: this.sid,
              retention: String(this.retention),
              password: this.password,
              name: file.name,
              comment: file.comment,
              type: file._File.type,
            },
            headers: {
              'x-csrf-token': this.config.csrf || '',
            },
            parallelUploads: 1,
            chunkSize: 5000000,
            endpoint: this.uploadURI,
            storeFingerprintForResuming: false,
            retryDelays: null,
            onAfterResponse: (req, res) => {
              // Remember uploadUrl for resuming
              if (req.getMethod() === 'POST' && req.getURL() === this.uploadURI && res.getStatus() === 201) {
                file._uploadUrl = res.getHeader('location');
              }
            },
            onError: error => {
              const status = error.originalResponse ? error.originalResponse.getStatus() : 0;
              let jsonResMessage = null;
              try {
                const body = JSON.parse(error.originalResponse.getBody());
                const known = body.error && this.lang.errors && this.lang.errors[body.error];
                jsonResMessage = known
                  ? known.replace('{limit}', body.limit > 10000 ? humanFileSize(body.limit) : body.limit)
                    .replace('{extension}', body.extension || '')
                  : body.message;
              } catch (e) {
              }
              // browser is offline
              if (!navigator.onLine) {
                this.setError(this.lang.uploadOffline);
                if (!onOnlineHandlerAttached) {
                  onOnlineHandlerAttached = true;
                  window.addEventListener('online', onOnlineHandler);
                }
              }
              // Client Error; 423: the previous request of this file is still being written, retry
              else if (status >= 400 && status < 500 && status !== 423) {
                file.error = jsonResMessage || error.message || error.toString();
                settle();
              }
              // Generic Error
              else {
                if (file._retries > 30) {
                  file.error = jsonResMessage || error.message || error.toString();
                  settle();
                  return;
                }
                file._retryDelay = Math.min(file._retryDelay * 1.7, 10000);
                file._retries++;
                console.log(error.message || error.toString(), '; will retry in', file._retryDelay, 'ms');
                setTimeout(startTusUpload, file._retryDelay);
              }
            },
            onProgress: (bytesUploaded, bytesTotal) => {
              // uploaded=total gets also emitted on error
              if (bytesUploaded === bytesTotal) return;
              file.error = '';
              file._retries = 0;
              file._retryDelay = 500;
              const percentage = Math.round(bytesUploaded / bytesTotal * 10000) / 100;
              file.progress = { percentage, humanSize: humanFileSize(bytesUploaded), bytesUploaded };
            },
            onSuccess: () => {
              file.uploaded = true;
              file.progress = { percentage: 100, humanSize: file.humanSize, bytesUploaded: file._File.size };
              settle();
            },
          }).start();
        };
        startTusUpload();
      });
    },
  },
});
