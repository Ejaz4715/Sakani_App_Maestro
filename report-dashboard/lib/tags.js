'use strict';
// Single source of truth for a flow's Run Type classification.
//
// THE TAG IS THE SOURCE OF TRUTH, NOT THE FOLDER. A flow's classification comes from the `tags:`
// list in its own Maestro config header - the property Maestro 2.9.0 itself reads (YamlConfig.tags)
// and filters on with --include-tags / --exclude-tags. Folders only organise the suite: a flow
// moved elsewhere, or a new flow added anywhere, is classified correctly from its tag alone.
//
// Tags are classification metadata only. Nothing here affects execution order, safety flags or a
// verdict.

const fs = require('fs');

// Run Type = the TEST PURPOSE (15/10/2026). Exactly two:
//   health-check       -> Health Check       every functional / service-coverage flow (Core + service suites)
//   release-readiness  -> Release Readiness  every end-to-end journey: the service E2Es AND the Main E2E
// A flow carries exactly one of the two tags. Run Type is independent of the suite grouping (a service
// E2E stays in its service suite under Services, but its Run Type is Release Readiness).
const RUN_TYPES = {
  'health-check': 'Health Check',
  'release-readiness': 'Release Readiness',
};

// The Run Type label of a flow from its tags, or null when it carries none of the two.
function runTypeOf(tags) {
  const t = tags || [];
  const found = Object.keys(RUN_TYPES).filter((k) => t.includes(k));
  return found.length === 1 ? RUN_TYPES[found[0]] : found.length > 1 ? 'Conflicting Run Types' : null;
}

// Dashboard scopes, defined purely by tag membership. Exactly two (restructured 12/10/2026):
//   Services = the Core flows (tag "health-check") + every service-suite flow (tag "service"),
//              including the service E2Es.
//   E2E      = the Main E2E journeys (tags "critical" / "happy-path").
// This is the SUITE GROUPING. It is separate from the Run Type (RUN_TYPES above): a service E2E is
// grouped under Services but its Run Type is Release Readiness; no Main E2E carries "health-check".
const SCOPES = {
  services: ['service', 'health-check'],
  e2e: ['critical', 'happy-path'],
};

// Tags that keep a flow OUT of a scope even when it carries one of the scope's tags. Service
// suites reuse "happy-path" as a test-design label, not as a Main E2E Run Type, so a service
// flow is reported under Services only and never under E2E.
const SCOPE_EXCLUDE = {
  e2e: ['service', 'health-check'],
};

function inScope(tags, scope) {
  const t = tags || [];
  return (SCOPES[scope] || []).some((s) => t.includes(s)) && !(SCOPE_EXCLUDE[scope] || []).some((s) => t.includes(s));
}

// "Happy Path", "happy_path", "HAPPY-PATH" -> "happy-path".
function normalizeTag(tag) {
  return String(tag)
    .trim()
    .replace(/^["']|["']$/g, '')
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, '-');
}

/**
 * Reads the `tags:` list from a flow's config header (the part before the first `---`).
 * Supports the two YAML forms Maestro accepts for a list:
 *   tags:            tags: [critical, smoke]
 *     - critical
 * @returns {string[]} normalized, de-duplicated tags; [] when the header declares none.
 */
function parseFlowTags(yamlText) {
  const lines = String(yamlText).split(/\r?\n/);
  const end = lines.findIndex((l) => /^---\s*$/.test(l));
  const header = end >= 0 ? lines.slice(0, end) : lines;

  const i = header.findIndex((l) => /^tags\s*:/.test(l));
  if (i < 0) return [];

  const tags = [];
  const inline = header[i].replace(/^tags\s*:\s*/, '').replace(/\s+#.*$/, '').trim();
  if (inline.startsWith('[')) {
    tags.push(...inline.replace(/^\[|\]$/g, '').split(','));
  } else if (inline) {
    tags.push(inline);
  } else {
    for (let j = i + 1; j < header.length; j++) {
      const l = header[j];
      if (/^\s*(#.*)?$/.test(l)) continue;
      const m = /^\s+-\s*(.+?)\s*(#.*)?$/.exec(l);
      if (!m) break; // next top-level key
      tags.push(m[1]);
    }
  }
  return [...new Set(tags.map(normalizeTag).filter(Boolean))];
}

function readFlowTags(flowFile) {
  try {
    return parseFlowTags(fs.readFileSync(flowFile, 'utf8'));
  } catch {
    return [];
  }
}

module.exports = { RUN_TYPES, runTypeOf, SCOPES, SCOPE_EXCLUDE, inScope, normalizeTag, parseFlowTags, readFlowTags };
