'use strict';

const escape = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const fill = (s, vars) => s.replace(/\{(\w+)\}/g, (m, k) => (vars[k] !== undefined ? vars[k] : m));

// *word* becomes the italic accent of the page titles
function richTitle(s) {
  return escape(s).replace(/\*([^*]+)\*/g, '<em>$1</em>');
}

/**
 * Text of the built-in legal notice and privacy pages, filled from the settings
 * of this instance so that they describe what it really keeps.
 */
function legalPage(kind, t, settings) {
  const site = settings.get('siteName') || 'Flyto';
  const email = settings.get('contactEmail');
  const vars = { site, email };

  if (kind === 'legal') {
    const l = t.legal;
    return {
      title: richTitle(l.title),
      sections: [
        { title: l.publisherTitle, paras: [
          settings.get('legalPublisher') || fill(l.publisherDefault, vars),
          ...(email ? [fill(l.contact, vars)] : []),
        ] },
        { title: l.hostTitle, paras: [settings.get('legalHost') || l.hostDefault] },
        { title: l.contentTitle, paras: [l.content, fill(email ? l.report : l.reportNoEmail, vars)] },
        { title: l.softwareTitle, paras: [l.software] },
      ],
    };
  }

  const p = t.privacy;
  const downloads = !settings.get('logDownloadIps') ? p.downloadsNoIp
    : settings.get('anonymizeIps') ? p.downloadsIpShort : p.downloadsIp;
  return {
    title: richTitle(p.title),
    intro: fill(p.intro, vars),
    sections: [
      { title: p.accountsTitle, paras: [p.accounts] },
      { title: p.filesTitle, paras: [p.files] },
      { title: p.downloadsTitle, paras: [fill(downloads, { days: settings.get('downloadLogRetentionDays') })] },
      { title: p.securityTitle, paras: [fill(p.security, { days: settings.get('auditRetentionDays') })] },
      { title: p.cookiesTitle, paras: [p.cookies] },
      { title: p.rightsTitle, paras: [fill(email ? p.rights : p.rightsNoEmail, vars)] },
    ],
    custom: settings.get('privacyUrl') ? { url: settings.get('privacyUrl'), label: p.custom } : null,
  };
}

module.exports = { legalPage };
