'use strict';
// Merges the per-flow evidence from the last run into one result set, and archives it.
//
// Verdicts are RE-DERIVED here from each flow's preserved raw log and recorded exit code. The
// status the runner wrote is deliberately not trusted: a verdict computed by a buggy runner
// cannot be audited after the fact, whereas the logs can be re-read at any time. If the two ever
// disagree, the log wins and the disagreement is reported.

const fs = require('fs');
const path = require('path');
const { deriveVerdict } = require('./lib/verdict');
const { readFlowTags, normalizeTag } = require('./lib/tags');

const ROOT = path.resolve(__dirname, '..');
// Default source: the last run's output. MERGE_FROM (a folder with the same per-flow layout - maestro.log,
// exit-code.txt, result.json, debug/) builds a report from assembled evidence instead, without running
// anything - used for consolidated reports (e.g. MERGE_FROM=<folder>/flows).
const OUT = process.env.MERGE_FROM ? path.resolve(ROOT, process.env.MERGE_FROM) : path.join(__dirname, 'maestro-output');
const HISTORY = path.join(__dirname, 'test-reports-history');
const RESULTS_DIR = path.join(ROOT, 'test-results');

if (!fs.existsSync(OUT)) {
  console.error(`No run output at ${path.relative(ROOT, OUT)}. Run "npm test" first.`);
  process.exit(2);
}

const runMeta = fs.existsSync(path.join(OUT, 'run.json'))
  ? JSON.parse(fs.readFileSync(path.join(OUT, 'run.json'), 'utf8'))
  : {};

const flowDirs = fs
  .readdirSync(OUT, { withFileTypes: true })
  // "_setup" holds the runner's services-session setup artifacts - a setup step, never a test.
  .filter((e) => e.isDirectory() && !e.name.startsWith('_'))
  .map((e) => path.join(OUT, e.name))
  .sort();

if (!flowDirs.length) {
  console.error('Run output contains no flow directories.');
  process.exit(2);
}

const disagreements = [];
const results = flowDirs.map((dir) => {
  const name = path.basename(dir);
  const logFile = path.join(dir, 'maestro.log');
  const log = fs.existsSync(logFile) ? fs.readFileSync(logFile, 'utf8') : '';

  const raw = fs.existsSync(path.join(dir, 'exit-code.txt'))
    ? fs.readFileSync(path.join(dir, 'exit-code.txt'), 'utf8').trim()
    : '';
  const exitCode = raw === '' || raw === 'null' || raw === 'undefined' ? null : Number(raw);

  const recorded = fs.existsSync(path.join(dir, 'result.json'))
    ? JSON.parse(fs.readFileSync(path.join(dir, 'result.json'), 'utf8'))
    : {};

  const verdict = deriveVerdict({ exitCode, log });
  if (recorded.status && recorded.status !== verdict.status) {
    disagreements.push(`${name}: runner recorded ${recorded.status}, log re-derives ${verdict.status}`);
  }

  // Point at a failure screenshot if the debug artifacts captured one.
  let screenshot = null;
  const shotDir = path.join(dir, 'debug');
  if (fs.existsSync(shotDir)) {
    const stack = [shotDir];
    while (stack.length) {
      const d = stack.pop();
      for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        const p = path.join(d, e.name);
        if (e.isDirectory()) stack.push(p);
        else if (/\.png$/i.test(e.name)) screenshot = p; // last one = the failing step
      }
    }
  }

  // Run Type tags travel with the result: the runner records them in result.json at run time. A
  // result written before tagging existed has none, so for those only the tags are read from the
  // recorded flow file's own `tags:` header - still the tag, never the folder - and marked as such.
  let tags = Array.isArray(recorded.tags) ? recorded.tags.map(normalizeTag) : null;
  let tagsSource = 'result';
  if (!tags) {
    tags = recorded.file ? readFlowTags(path.join(ROOT, recorded.file)) : [];
    tagsSource = 'flow-header-at-merge';
  }

  return {
    flow: name,
    file: recorded.file || null,
    suite: recorded.suite || null,
    tags,
    tagsSource,
    startedAt: recorded.startedAt || null,
    durationMs: typeof recorded.durationMs === 'number' ? recorded.durationMs : null,
    logPath: path.relative(ROOT, logFile).replace(/\\/g, '/'),
    screenshotPath: screenshot ? path.relative(ROOT, screenshot).replace(/\\/g, '/') : null,
    ...verdict,
  };
});

const counts = results.reduce((a, r) => ((a[r.status] = (a[r.status] || 0) + 1), a), {});
const merged = {
  generatedAt: new Date().toISOString(),
  device: runMeta.device || null,
  startedAt: runMeta.startedAt || null,
  finishedAt: runMeta.finishedAt || null,
  includeE2e: !!runMeta.includeE2e,
  totals: {
    flows: results.length,
    pass: counts.PASS || 0,
    fail: counts.FAIL || 0,
    blockedEnvironment: counts.BLOCKED_ENVIRONMENT || 0,
    unresolved: counts.UNRESOLVED || 0,
    npsAppearances: results.reduce((n, r) => n + r.npsAppearances, 0),
  },
  disagreements,
  results,
};

fs.mkdirSync(RESULTS_DIR, { recursive: true });
fs.mkdirSync(HISTORY, { recursive: true });
fs.writeFileSync(path.join(RESULTS_DIR, 'merged-results.json'), JSON.stringify(merged, null, 2));

const stamp = merged.generatedAt.replace(/[:.]/g, '-');
fs.writeFileSync(path.join(HISTORY, `${stamp}.json`), JSON.stringify(merged, null, 2));

console.log(
  `Merged ${merged.totals.flows} flow(s): ${merged.totals.pass} pass, ${merged.totals.fail} fail, ` +
    `${merged.totals.blockedEnvironment} blocked (environment), ${merged.totals.unresolved} unresolved`
);
if (merged.totals.npsAppearances)
  console.log(`Known NPS survey dismissed ${merged.totals.npsAppearances} time(s) - informational, never affects a verdict.`);
if (disagreements.length) {
  console.log('\nRunner/log disagreements (the log is authoritative):');
  for (const d of disagreements) console.log('  ' + d);
}
console.log(`\n-> ${path.relative(ROOT, path.join(RESULTS_DIR, 'merged-results.json'))}`);
