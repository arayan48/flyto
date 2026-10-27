'use strict';
const nodemailer = require('nodemailer');
const debug = require('debug')('flyto:mailer');
const config = require('../config');

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function fill(template, vars) {
  return String(template).replace(/\{(\w+)\}/g, (m, k) => (k in vars ? vars[k] : m));
}

class Mailer {

  constructor(settings) {
    this.settings = settings;
    this.transport = null;
    this.transportKey = null;
  }

  _options() {
    const s = this.settings;
    if (s.get('smtpHost')) {
      return {
        host: s.get('smtpHost'),
        port: s.get('smtpPort'),
        secure: s.get('smtpSecure'),
        auth: s.get('smtpUser') ? { user: s.get('smtpUser'), pass: s.get('smtpPass') } : undefined,
      };
    }
    return config.smtpUrl || null;
  }

  get enabled() {
    return !!this._options();
  }

  _transport() {
    const options = this._options();
    if (!options) return null;
    const key = JSON.stringify(options);
    if (key !== this.transportKey) {
      this.transport = nodemailer.createTransport(options, { from: this.from() });
      this.transportKey = key;
    }
    return this.transport;
  }

  from() {
    const siteName = this.settings.get('siteName');
    const address = this.settings.get('smtpFrom') || config.mailFrom;
    if (!address) return `${ siteName } <flyto@localhost>`;
    return address.includes('<') ? address : `${ siteName } <${ address }>`;
  }

  async verify() {
    const transport = this._transport();
    if (!transport) throw Object.assign(new Error('SMTP is not configured'), { status: 400, code: 'smtpDisabled' });
    await transport.verify();
  }

  /**
   * @param {Object} lang translations of the recipient
   * @param {string} name key in lang.emails
   */
  async send(to, lang, name, vars = {}) {
    const transport = this._transport();
    if (!transport) {
      debug(`SMTP disabled, not sending ${ name } to ${ to }`);
      return false;
    }
    const strings = (lang.emails && lang.emails[name]) || config.languages[config.defaultLanguage].emails[name];
    const siteName = this.settings.get('siteName');
    const all = { siteName, ...vars };
    const subject = fill(strings.subject, all);
    const paragraphs = strings.body.map(p => fill(p, all));
    const button = strings.button && vars.url ? fill(strings.button, all) : null;
    const footer = fill((lang.emails && lang.emails.footer) || '{siteName}', all);

    const text = [...paragraphs, vars.url || '', '', '-- ', footer].join('\n\n').replace(/\n{3,}/g, '\n\n');
    const html = `<!doctype html><html><body style="margin:0;padding:24px;background:#f3f5f9;font-family:'DM Sans',Helvetica,Arial,sans-serif;color:#0E1420;line-height:1.6">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:8px;border:1px solid #e3e7ef">
<tr><td style="padding:24px 32px 0;font-size:22px;color:#2F6BFF;font-weight:600">${ escapeHtml(siteName) }</td></tr>
<tr><td style="padding:16px 32px 8px;font-size:16px">
${ paragraphs.map(p => `<p style="margin:0 0 16px">${ escapeHtml(p) }</p>`).join('\n') }
${ button ? `<p style="margin:24px 0"><a href="${ escapeHtml(vars.url) }" style="background:#2F6BFF;color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:6px;display:inline-block">${ escapeHtml(button) }</a></p>
<p style="margin:0 0 16px;font-size:13px;color:#5b6475;word-break:break-all">${ escapeHtml(vars.url) }</p>` : '' }
</td></tr>
<tr><td style="padding:0 32px 24px;font-size:12px;color:#5b6475">${ escapeHtml(footer) }</td></tr>
</table></td></tr></table></body></html>`;

    await transport.sendMail({ from: this.from(), to, subject, text, html });
    debug(`Sent ${ name } to ${ to }`);
    return true;
  }
}

module.exports = Mailer;
