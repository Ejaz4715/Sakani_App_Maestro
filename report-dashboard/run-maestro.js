'use strict';
// Runs the Maestro suite one flow at a time and preserves the evidence each flow produced.
//
//   npm test                          the 10 core service flows (.maestro/services/core/)
//   npm test -- --flows login,wallet  just those flows
//   npm test -- --list                show what would run, run nothing
//
// TWO EXECUTABLE CATEGORIES (restructured 12/10/2026):
//   .maestro/services/core/*.yaml         10 read-only app flows               (--service core)
//   .maestro/services/<service>/*.yaml    Jira service suites, one flow per test case + one E2E each
//   .maestro/e2e/*.yaml                   Main E2E journeys - change business data, double-flag guarded
//
//   npm test -- --scope services                          every service flow (core + all suites)
//   npm test -- --service mortgage-calculator             one service (or a comma-separated list)
//   npm test -- --service core                            only the 10 core service flows
//   npm test -- --service real-estate-tax --include-tags functional   only its functional cases
//   npm test -- --scope services --include-tags e2e       the service E2Es
//   npm test -- --scope e2e --include-e2e --yes-i-understand-this-changes-business-data   Main E2E
//   npm test -- --flows mortgage-calculator-happy-path    one flow by name (services; plus e2e when included)
//   npm test -- --exclude-tags known-defect,needs-ineligible-account
//   npm test -- --service mortgage-calculator --env PRICE=1500000   forwarded to maestro as -e
//
// --include-tags / --exclude-tags read each flow's own `tags:` header (lib/tags.js). include is
// "any of", exclude is "none of" - the same meaning as maestro's flags of the same name. Service
// helpers live in <service>/subflows/ and are never collected as tests.
//
// Flows tagged "writes-data" (financial-advisor TC-001..TC-003: real advisory submissions) are
// excluded unless --yes-i-understand-this-changes-business-data is given, exactly like e2e.
//
// WHY ONE FLOW AT A TIME: a batch that dies halfway loses the per-flow exit codes, and an exit
// code is half of the pass/fail rule. Each flow gets its own log, its own exit-code file and its
// own debug artifacts, so a run interrupted at any point still leaves every finished flow
// auditable.
//
// e2e IS EXCLUDED BY DEFAULT and cannot be included by accident: those flows reserve units, pay
// booking fees and cancel real bookings on the target account. Two explicit flags are required.

const { execFileSync, spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { deriveVerdict } = require('./lib/verdict');
const { readFlowTags } = require('./lib/tags');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(__dirname, 'maestro-output');
const E2E_DIR = path.join(ROOT, '.maestro', 'e2e');
const SERVICES_DIR = path.join(ROOT, '.maestro', 'services');

const argv = process.argv.slice(2);
const has = (f) => argv.includes(f);
const valueOf = (f) => {
  const i = argv.indexOf(f);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : null;
};

const includeE2e = has('--include-e2e') && has('--yes-i-understand-this-changes-business-data');
if (has('--include-e2e') && !includeE2e) {
  console.error('Refusing to run e2e flows: they create and cancel real bookings and payments.');
  console.error('Add --yes-i-understand-this-changes-business-data if that is genuinely intended.');
  process.exit(2);
}

const yamlsIn = (dir) =>
  fs.existsSync(dir)
    ? fs.readdirSync(dir).filter((f) => f.endsWith('.yaml')).sort().map((f) => path.join(dir, f))
    : [];

const list = (f) => (valueOf(f) || '').split(',').map((x) => x.trim()).filter(Boolean);
const confirmedWrites = has('--yes-i-understand-this-changes-business-data');

// Every sub-folder of .maestro/services/ is a service: core (the 10 read-only app flows) and the
// Jira suites. CORE is the default run and signs itself in (see the services-session note below).
const CORE = 'core';
const SERVICES = fs.existsSync(SERVICES_DIR)
  ? fs.readdirSync(SERVICES_DIR, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name).sort()
  : [];
const wantedServices = list('--service');
const unknownServices = wantedServices.filter((x) => !SERVICES.includes(x));
if (unknownServices.length) {
  console.error(`Unknown service(s): ${unknownServices.join(', ')}`);
  console.error(`Available: ${SERVICES.join(', ')}`);
  process.exit(2);
}

// Scopes: services | e2e | all. With no --scope, --service or --flows the default is the 10 core
// service flows - the same read-only set the default run has always executed. --service and
// --flows imply the services scope (e2e is added only with the double confirmation flag).
const SCOPE_NAMES = ['services', 'e2e'];
let scopes = list('--scope');
if (scopes.includes('all')) scopes = [...SCOPE_NAMES];
const badScopes = scopes.filter((x) => !SCOPE_NAMES.includes(x));
if (badScopes.length) {
  console.error(`Unknown scope(s): ${badScopes.join(', ')} (use ${SCOPE_NAMES.join(', ')} or all)`);
  process.exit(2);
}
const defaultRun = !scopes.length && !wantedServices.length && !valueOf('--flows');
if (defaultRun) wantedServices.push(CORE);
if (!scopes.length) scopes = ['services'];
if (includeE2e && !scopes.includes('e2e')) scopes.push('e2e');
if (scopes.includes('e2e') && !includeE2e) {
  console.error('Refusing to run e2e flows: they create and cancel real bookings and payments.');
  console.error('Add --include-e2e --yes-i-understand-this-changes-business-data if that is genuinely intended.');
  process.exit(2);
}

const serviceFlows = (wantedServices.length ? wantedServices : SERVICES)
  .flatMap((x) => yamlsIn(path.join(SERVICES_DIR, x)));
let flows = [
  ...(scopes.includes('services') ? serviceFlows : []),
  ...(scopes.includes('e2e') ? yamlsIn(E2E_DIR) : []),
];

// Each flow's evidence folder is named after its file, so two flows with one name would overwrite
// each other's results. Refuse instead of reporting half of them.
const seen = {};
for (const f of flows) (seen[path.basename(f, '.yaml')] = seen[path.basename(f, '.yaml')] || []).push(f);
const clashes = Object.entries(seen).filter(([, v]) => v.length > 1);
if (clashes.length) {
  for (const [k, v] of clashes) console.error(`Duplicate flow name "${k}": ${v.map((f) => path.relative(ROOT, f)).join(', ')}`);
  process.exit(2);
}

const includeTags = list('--include-tags');
const excludeTags = list('--exclude-tags');
if (includeTags.length) flows = flows.filter((f) => readFlowTags(f).some((t) => includeTags.includes(t)));
if (excludeTags.length) flows = flows.filter((f) => !readFlowTags(f).some((t) => excludeTags.includes(t)));

const only = valueOf('--flows');
if (only) {
  const wanted = only.split(',').map((s) => s.trim().replace(/\.yaml$/, '')).filter(Boolean);
  const matched = flows.filter((f) => wanted.includes(path.basename(f, '.yaml')));
  const missing = wanted.filter((w) => !matched.some((f) => path.basename(f, '.yaml') === w));
  if (missing.length) {
    console.error(`Unknown flow(s): ${missing.join(', ')}`);
    console.error(`Available: ${flows.map((f) => path.basename(f, '.yaml')).join(', ')}`);
    process.exit(2);
  }
  flows = matched;
}

const writers = flows.filter((f) => readFlowTags(f).includes('writes-data'));
if (writers.length && !confirmedWrites) {
  if (only) {
    console.error(`Refusing to run ${writers.map((f) => path.basename(f, '.yaml')).join(', ')}: tagged writes-data (real backend writes).`);
    console.error('Add --yes-i-understand-this-changes-business-data if that is genuinely intended.');
    process.exit(2);
  }
  flows = flows.filter((f) => !writers.includes(f));
}

if (!flows.length) {
  console.error('No flows selected.');
  process.exit(2);
}

if (has('--list')) {
  console.log(`Would run ${flows.length} flow(s):`);
  for (const f of flows) {
    const tags = readFlowTags(f);
    console.log('  ' + path.relative(ROOT, f) + `  [${tags.length ? tags.join(', ') : 'no tags'}]`);
  }
  if (!includeE2e) console.log('\ne2e flows are excluded (they change business data).');
  if (writers.length && !confirmedWrites)
    console.log(`writes-data flows excluded: ${writers.map((f) => path.basename(f, '.yaml')).join(', ')}`);
  process.exit(0);
}

const sh = (cmd, args) => {
  try {
    return execFileSync(cmd, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  } catch {
    return '';
  }
};

const device = valueOf('--device') || (() => {
  const line = sh('adb', ['devices']).split(/\r?\n/).find((l) => /\tdevice$/.test(l));
  return line ? line.split('\t')[0] : null;
})();

if (!device) {
  console.error('No device connected (adb devices shows none ready).');
  process.exit(2);
}

// Device health gate. A degraded emulator produces runs that look like test failures but are not
// - an ANR, a dead package service or an app that crashes on launch all did exactly that here on
// 27/09/2026. Refuse to start rather than record a misleading result.
function healthy() {
  const pkgs = sh('adb', ['-s', device, 'shell', 'pm', 'list', 'packages']);
  if ((pkgs.match(/^package:/gm) || []).length < 50) return 'package service not responding';
  const acts = sh('adb', ['-s', device, 'shell', 'dumpsys', 'activity', 'activities']);
  if (!/ResumedActivity/.test(acts)) return 'activity service not responding';
  if (sh('adb', ['-s', device, 'shell', 'getprop', 'sys.boot_completed']).trim() !== '1')
    return 'device not finished booting';
  return null;
}

const unhealthy = healthy();
if (unhealthy) {
  console.error(`Device ${device} is not healthy: ${unhealthy}`);
  console.error('Cold-boot the emulator and try again; a run started now would not be trustworthy.');
  process.exit(2);
}

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });

// --env KEY=VALUE (repeatable) -> maestro -e KEY=VALUE. Values are not echoed: they may be IDs.
const envArgs = argv.flatMap((a, i) => (a === '--env' && /^[A-Za-z_][A-Za-z0-9_]*=/.test(argv[i + 1] || '') ? ['-e', argv[i + 1]] : []));

const startedAt = new Date();
console.log(`Device ${device} | ${flows.length} flow(s) | scope ${scopes.join('+')} | e2e ${includeE2e ? 'INCLUDED' : 'excluded'}\n`);

// Folder-derived grouping for the report's Suite column only - classification stays tag-based.
function suiteOf(flowPath) {
  const r = path.relative(path.join(ROOT, '.maestro'), flowPath).split(path.sep);
  // .maestro/services/<service>/<flow>.yaml -> "services/<service>" (core included); .maestro/e2e -> "e2e"
  if (r[0] === 'services') return `services/${r[1]}`;
  return 'e2e';
}

// The shared services session (below) is for the Jira suites only. The core flows sign themselves
// in as their own accounts (launchApp clearState + login.yaml), so they never wait on it - the
// same behaviour they had before they moved under services/.
const needsSession = (flowPath) => {
  const s = suiteOf(flowPath);
  return s.startsWith('services/') && s !== `services/${CORE}`;
};

function maestroTest(flowPath, debugDir) {
  // On Windows the command runs through a shell, which splits unquoted arguments at spaces - a
  // flow file or output folder with a space in its name ("check elgibilty.yaml") then reaches
  // Maestro as two arguments. Quote every argument when a shell is used.
  const useShell = process.platform === 'win32';
  const args = ['test', '--udid', device, '--debug-output', debugDir, ...envArgs, flowPath].map((a) => (useShell ? `"${a}"` : a));
  const r = spawnSync(
    'maestro',
    args,
    { cwd: ROOT, encoding: 'utf8', shell: useShell, maxBuffer: 64 * 1024 * 1024 }
  );
  return { log: (r.stdout || '') + (r.stderr || ''), exitCode: r.status };
}

// Service suites assume a signed-in suite account (see .maestro/subflows/services-session.yaml).
// It is established once, right before the first service flow, and kept OUT of the per-flow
// folders so merge-results.js never counts it as a test. --no-session-setup skips it when the
// device is already prepared by hand.
const SESSION_FLOW = path.join(ROOT, '.maestro', 'subflows', 'services-session.yaml');
let sessionState = has('--no-session-setup') ? 'skipped-by-flag' : 'pending';
let sessionFailure = null;
function ensureServicesSession() {
  if (sessionState !== 'pending') return;
  process.stdout.write('[setup] services session ... ');
  const s = maestroTest(SESSION_FLOW, path.join(OUT, '_setup', 'debug'));
  fs.writeFileSync(path.join(OUT, 'services-session.log'), s.log);
  const v = deriveVerdict(s);
  sessionState = v.status === 'PASS' ? 'ok' : 'failed';
  if (sessionState === 'failed') sessionFailure = `services session setup ${v.status}: ${v.firstFailure || v.envReason || 'exit ' + s.exitCode}`;
  console.log(sessionState === 'ok' ? 'signed in' : `FAILED (${sessionFailure})`);
}

const results = [];
for (const flowPath of flows) {
  const name = path.basename(flowPath, '.yaml');
  const dir = path.join(OUT, name);

  const before = healthy();
  if (!before && needsSession(flowPath)) ensureServicesSession();
  fs.mkdirSync(dir, { recursive: true });
  const t0 = Date.now();
  process.stdout.write(`${name} ... `);

  let exitCode = null;
  let log = '';
  if (before) {
    log = `Skipped: device unhealthy before this flow (${before}).`;
    exitCode = null;
  } else if (sessionFailure && needsSession(flowPath)) {
    // No exit code is recorded, so the verdict is UNRESOLVED - never a product FAIL.
    log = `Skipped: ${sessionFailure}. See maestro-output/services-session.log.`;
    exitCode = null;
  } else {
    ({ log, exitCode } = maestroTest(flowPath, path.join(dir, 'debug')));
  }

  const durationMs = Date.now() - t0;
  fs.writeFileSync(path.join(dir, 'maestro.log'), log);
  fs.writeFileSync(path.join(dir, 'exit-code.txt'), String(exitCode));

  const verdict = deriveVerdict({ exitCode, log });
  const record = {
    flow: name,
    file: path.relative(ROOT, flowPath).replace(/\\/g, '/'),
    suite: suiteOf(flowPath),
    // Run Type classification, read from the flow's own `tags:` header - never from its folder.
    tags: readFlowTags(flowPath),
    startedAt: new Date(t0).toISOString(),
    durationMs,
    logPath: path.relative(ROOT, path.join(dir, 'maestro.log')).replace(/\\/g, '/'),
    ...verdict,
  };
  fs.writeFileSync(path.join(dir, 'result.json'), JSON.stringify(record, null, 2));
  results.push(record);

  const secs = `${Math.round(durationMs / 1000)}s`;
  console.log(`${record.status} (exit ${record.exitCode}, ${secs}${record.npsAppearances ? `, NPS x${record.npsAppearances}` : ''})`);
  if (record.firstFailure) console.log(`    ${record.firstFailure.slice(0, 120)}`);
  if (record.envReason) console.log(`    environment: ${record.envReason}`);
}

fs.writeFileSync(
  path.join(OUT, 'run.json'),
  JSON.stringify(
    { startedAt: startedAt.toISOString(), finishedAt: new Date().toISOString(), device, includeE2e, scopes, servicesSession: sessionState, results },
    null,
    2
  )
);

const failed = results.filter((r) => r.status === 'FAIL').length;
const blocked = results.filter((r) => r.status !== 'PASS' && r.status !== 'FAIL').length;
console.log(`\n${results.filter((r) => r.status === 'PASS').length} passed, ${failed} failed, ${blocked} blocked/unresolved`);
console.log('Now run: npm run post-test');

// Non-zero only for real test failures. A blocked/unresolved run is not evidence about the
// product, and must not be reported as a red build.
process.exit(failed > 0 ? 1 : 0);
