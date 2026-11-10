'use strict';
// Human-readable DISPLAY names for service-suite results in the dashboard.
//
// Presentation only. Service flow files have readable names (renamed from Jira IDs 11/10/2026, see
// docs/services/flow-file-map.json); the Jira test-case ID stays in each flow's header, name: and tags
// and in the raw logs, for traceability and debugging. Only what the dashboard SHOWS is derived here:
//   suite  services/real-estate-tax                      -> Real Estate Tax
//   title  real-estate-tax-duplicate-request-check       -> Duplicate request check
//          real-estate-tax-e2e (tag e2e)                 -> Real Estate Tax End-to-End Journey
// The title comes from the flow's own `name:` header (its existing scenario metadata) with the ID
// prefix and any embedded Jira key removed. The 10 Core service flows (suite "services/core") and the
// Main E2E journeys (suite "e2e") keep their file name as title.

const fs = require('fs');
const path = require('path');

const CORE = 'core';
const SERVICE_LABELS = {
  core: 'Core',
  'financial-advisor': 'Financial Advisor',
  'mortgage-calculator': 'Mortgage Calculator',
  'neighborhood-greetings': 'Neighborhood Greetings',
  'real-estate-tax': 'Real Estate Tax',
  'sakani-offers': 'Sakani Offers',
};

// Readable titles for Core flows whose file names are not self-explanatory (Home features, 14/10/2026).
// The original 10 Core flows keep their file name as title.
const CORE_TITLES = {
  'edit-dashboard-remove-reset': 'Edit Dashboard - Remove and Reset',
  'baiti-purchase-consent': 'Baiti - Purchase Consent',
  'home-voucher-details': 'Home Voucher - Details',
  'home-voucher-redeem-type': 'Home Voucher - Redeem Type',
  // Home global search (15/10/2026)
  'search-home-property': 'Home Search - Property',
  'search-home-service': 'Home Search - Service',
  'search-home-support': 'Home Search - Support',
  'search-home-no-results-and-clear': 'Home Search - No Results and Clear',
  // Profile completion (15/10/2026)
  'Complete profile': 'Complete Profile',
};

// Results recorded before the 12/10/2026 restructure carry the old location of the Core flows as
// their suite ("regression-readonly", then briefly plain "services"); they are shown as Core.
const LEGACY_CORE = ['regression-readonly', 'services'];
const serviceOf = (suite) => (LEGACY_CORE.includes(String(suite)) ? CORE
  : (/^services\/(.+)$/.exec(String(suite || '')) || [])[1] || null);

// Only two top-level groups exist, Services and E2E; anything not under services/ is a Main E2E result.
const GROUP_LABELS = { e2e: 'E2E' };

function suiteLabel(suite) {
  const s = serviceOf(suite);
  if (!s) return GROUP_LABELS[suite] || suite;
  return SERVICE_LABELS[s] || s.split('-').map((w) => w[0].toUpperCase() + w.slice(1)).join(' ');
}

// Jira keys in any visible text: full test-case IDs (SAKANI-23459-TC-004, sakani-23459-tc-004-pass-1),
// bare ticket keys (SAKANI-41692) and stand-alone case IDs (TC-004, E2E-001).
function scrubIds(text) {
  return String(text)
    .replace(/\s*\((?:[^()]*?\s)?SAKANI-\d{3,6}\)/gi, '') // "(guards SAKANI-41692)"
    .replace(/\bsakani-\d{3,6}-(?:tc|e2e)-[0-9a-z]+(?:-)?/gi, '')
    .replace(/\bSAKANI-\d{3,6}\b/gi, 'ticket')
    .replace(/\b(?:TC|E2E)-\d{3}[A-Z]?\b\s*/g, '')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

function yamlName(file) {
  try {
    const head = fs.readFileSync(file, 'utf8').split(/\r?\n/);
    const end = head.findIndex((l) => /^---\s*$/.test(l));
    const line = head.slice(0, end < 0 ? head.length : end).find((l) => /^name\s*:/.test(l));
    return line ? line.replace(/^name\s*:\s*/, '').replace(/^["']|["']$/g, '').trim() : null;
  } catch {
    return null;
  }
}

/**
 * @param {{flow:string, file:string|null, suite:string|null, tags:string[]}} r  merged result
 * @param {string} root project root
 * @returns {{suite:string, title:string, service:boolean, source:string}}
 */
function displayFor(r, root) {
  const service = serviceOf(r.suite);
  const rawTitle = r.file ? path.basename(r.file).replace(/\.ya?ml$/i, '') : r.flow;
  if (!service) return { suite: suiteLabel(r.suite) || 'unknown', title: rawTitle, service: false, source: 'file' };

  const label = suiteLabel(r.suite);
  // Core flows carry no Jira IDs: shown by file name, step text unaltered (as before the move) -
  // except the Home-feature flows added 14/10/2026, which have explicit readable titles.
  if (service === CORE) {
    const title = CORE_TITLES[rawTitle];
    return { suite: label, title: title || rawTitle, service: false, source: title ? 'core-title' : 'file' };
  }
  const isE2e = (r.tags || []).includes('e2e') || /(-E2E-\d+|-e2e)$/i.test(r.flow || '');
  if (isE2e) return { suite: label, title: `${label} End-to-End Journey`, service: true, source: 'e2e-journey' };

  const fromYaml = r.file ? yamlName(path.join(root, r.file)) : null;
  const title = fromYaml ? scrubIds(fromYaml) : '';
  return title
    ? { suite: label, title, service: true, source: 'yaml-name' }
    : { suite: label, title: `${label} scenario`, service: true, source: 'fallback' };
}

module.exports = { SERVICE_LABELS, suiteLabel, scrubIds, displayFor };
