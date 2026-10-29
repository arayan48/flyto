const path = require('path');
const fs = require('fs');

// Default Config
// Do not edit this, generate a config.<ENV>.js for your NODE_ENV
// or use ENV-VARS like FLYTO_PORT=8000 (legacy PSITRANSFER_ prefix still accepted)
const config = {
  "uploadDir": path.resolve(__dirname + '/data'),
  // PostgreSQL for the metadata (required), e.g. postgres://flyto:secret@database:5432/flyto
  "dbUrl": '',
  // set to serve Flyto from a sub-path
  "baseUrl": '/',
  // use to set custom upload url (subfolder to baseUrl)
  "uploadAppPath": '/',
  "iface": '0.0.0.0',
  // set to false to disable HTTP
  "port": 3000,
  // HTTPS, set all 3 values to enable
  "sslPort": 8443,
  "sslKeyFile": false,
  "sslCertFile": false,
  // Force redirect to https
  // can be true or a specific url like https://example.com:8443
  // keep empty to disable
  "forceHttps": '',
  // Use trust proxy to show real IP on logs when reverse proxy are used
  // see https://expressjs.com/en/guide/behind-proxies.html for options
  "trustProxy": '',
  // retention options in seconds:label
  "retentions": {
    "one-time": "one time download",
    "3600": "1 Hour",
    "21600": "6 Hours",
    "86400": "1 Day",
    "259200": "3 Days",
    "604800": "1 Week",
    "1209600": "2 Weeks",
    "2419200": "4 Weeks",
    "4838400": "8 Weeks"
  },
  // public address used in e-mails and share links, e.g. https://files.example.com/
  // keep empty to use the address of each request
  "publicUrl": '',
  // first admin account, created on start when no admin exists yet
  "adminEmail": '',
  "adminPassword": '',
  "adminName": '',
  // optional cache for sessions, rate limits and dashboards, e.g. redis://redis:6379
  "redisUrl": '',
  // outgoing mail, e.g. smtps://user:pass@smtp.example.com:465, can also be set in /admin
  "smtpUrl": '',
  "mailFrom": '',
  // removed in 0.3.0, only read to warn about them: accounts replace both passwords
  "adminPass": false,
  "uploadPass": false,
  // make the bucket-password field mandatory (default of the /admin setting)
  "requireBucketPassword": false,
  "defaultRetention": "604800",
  // expire every file after maxAge (eg never downloaded one-time files)
  "maxAge": 3600 * 24 * 75, // 75 days
  // maximum file-size for previews in byte
  "maxPreviewSize": Math.pow(2, 20) * 2, // 2MB
  "mailTemplate": 'mailto:?subject=File Transfer&body=You can download the files here: %%URL%%',
  // see https://github.com/expressjs/morgan
  // set to false to disable logging
  "accessLog": ':date[iso] :method :url :status :response-time :remote-addr',
  // event webhooks
  // invokes an HTTP POST to a url whenever a file is downloaded
  // for more info, see the webhooks section of docs/configuration.md
  "fileDownloadedWebhook": null,
  "fileUploadedWebhook": null,
  // Fallback language
  "defaultLanguage": "en",
  // Default upload limits in bytes, adjustable in /admin (10 GiB per transfer when unset)
  "maxFileSize": null,
  "maxBucketSize": null,
  "plugins": ['file-downloaded-webhook', 'file-uploaded-webhook'],
  // Disable the QR code button for download url sharing, set to true to disable
  "disableQrCode": false,
  // check GitHub for new releases and announce them on /admin and in the logs
  "updateCheck": true,
  "updateCheckRepo": 'arayan48/flyto',
};

const envConfFile = path.resolve(__dirname, `config.${ process.env.NODE_ENV }.js`);
if (process.env.NODE_ENV && fs.existsSync(envConfFile)) {
  Object.assign(config, require(envConfFile));
}

// Load config from ENV VARS
// "true" and "false" are booleans, anything else keeps the type of the default value
const SWITCHES = new Set(['requireBucketPassword', 'disableQrCode', 'updateCheck']);

function parseEnv(value, current, key) {
  if (SWITCHES.has(key)) return !/^(false|0|no|off)$/i.test(value);
  if (value === 'false') return false;
  if (value === 'true' && typeof current !== 'string') return true;
  if (typeof current === 'number') return parseInt(value, 10);
  if (Array.isArray(current)) return value.split(',');
  if (current === null) {
    // unset by default: numbers such as maxFileSize or strings such as webhook urls
    try {
      return JSON.parse(value);
    } catch (e) {
      return value;
    }
  }
  if (typeof current === 'object') return JSON.parse(value);
  return value;
}

for (let k in config) {
  const suffix = k.replace(/([A-Z])/g, $1 => "_" + $1).toUpperCase();
  const envName = process.env['FLYTO_' + suffix] ? 'FLYTO_' + suffix : 'PSITRANSFER_' + suffix;
  if (process.env[envName]) {
    config[k] = parseEnv(process.env[envName], config[k], k);
  }
}

if (!config.baseUrl.endsWith('/')) config.baseUrl = config.baseUrl + '/';
if (!config.uploadAppPath.endsWith('/')) config.uploadAppPath = config.uploadAppPath + '/';

config.uploadAppPath = config.baseUrl.substr(0, config.baseUrl.length - 1) + config.uploadAppPath;

// every language falls back to the default one for missing strings; no prototype, a locale
// such as "constructor" coming from a request must not be found
config.languages = Object.create(null);
config.languages[config.defaultLanguage] = require(`./lang/${ config.defaultLanguage }`);
fs.readdirSync(path.resolve(__dirname, 'lang')).forEach(lang => {
  lang = lang.replace('.js', '');
  if (lang === config.defaultLanguage) return;
  config.languages[lang] = {
    ...config.languages[config.defaultLanguage],
    ...require(`./lang/${ lang }`)
  };
});

module.exports = config;
