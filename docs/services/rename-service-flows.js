'use strict';
// One-off (11/10/2026): rename service flow files from Jira IDs to readable names, per
// docs/services/flow-file-map.json, and update every live reference. Raw evidence is NOT rewritten:
// it records runs under the names the files had at the time; the map file translates.
//   node docs/services/rename-service-flows.js [--dry-run]
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const MAP = require('./flow-file-map.json');
const dry = process.argv.includes('--dry-run');

const pairs = [];
for (const [svc, m] of Object.entries(MAP)) {
  if (svc.startsWith('_')) continue;
  for (const [oldId, newName] of Object.entries(m)) pairs.push({ svc, oldId, newName });
}

// 1. rename
for (const p of pairs) {
  const from = path.join(ROOT, '.maestro', 'services', p.svc, `${p.oldId}.yaml`);
  const to = path.join(ROOT, '.maestro', 'services', p.svc, `${p.newName}.yaml`);
  if (!fs.existsSync(from)) throw new Error(`missing ${from}`);
  if (fs.existsSync(to)) throw new Error(`target exists ${to}`);
  if (!dry) fs.renameSync(from, to);
}

// 2. live references (never history, run output or node_modules)
const SKIP = new Set(['test-results', 'test-reports-history', 'maestro-output', 'node_modules', '.git']);
const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) =>
  SKIP.has(e.name) ? [] : e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]);
const textFiles = walk(ROOT).filter((f) => /\.(ya?ml|md|js|json|sh)$/i.test(f) && !f.endsWith('flow-file-map.json') && !f.endsWith('rename-service-flows.js'));

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const changed = {};
for (const f of textFiles) {
  const before = fs.readFileSync(f, 'utf8');
  let s = before;
  for (const p of pairs) {
    // full file name, with or without a path before it
    s = s.replace(new RegExp(`${esc(p.oldId)}\\.yaml`, 'g'), `${p.newName}.yaml`);
    // runner / CLI usage by flow name: --flows SAKANI-32007-TC-001
    s = s.replace(new RegExp(`(--flows[ =])${esc(p.oldId)}(?![0-9A-Za-z-])`, 'g'), `$1${p.newName}`);
    // shorthand file names used in tables: `-TC-008.yaml`
    const short = p.oldId.replace(/^SAKANI-\d+/, '');
    // scoped to the doc's own service: an unscoped shorthand once mapped MC TC-001..004 to FA files
    if (/TRACEABILITY|TEST-CASES/.test(f) && f.replace(/\\/g, '/').includes('/' + p.svc + '/')) s = s.replace(new RegExp('`' + esc(short) + '\\.yaml`', 'g'), '`' + p.newName + '.yaml`');
  }
  if (s !== before) {
    changed[path.relative(ROOT, f).replace(/\\/g, '/')] = (before.length !== s.length) ? 'updated' : 'updated';
    if (!dry) fs.writeFileSync(f, s);
  }
}
console.log(`${dry ? '[dry-run] ' : ''}renamed ${pairs.length} flow files`);
console.log(`${dry ? '[dry-run] ' : ''}reference files updated: ${Object.keys(changed).length}`);
for (const f of Object.keys(changed)) console.log('  ' + f);
