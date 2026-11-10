'use strict';
// Renders the merged results as the interactive HTML dashboard.
//
// Presentation only. Every status comes from test-results/merged-results.json, which
// merge-results.js re-derives from the preserved raw logs and exit codes - nothing here decides
// pass or fail. For display the verdicts are mapped onto the dashboard's three states:
//   PASS -> Passed, FAIL -> Failed, BLOCKED_ENVIRONMENT / UNRESOLVED -> Skipped
// (a blocked or unresolved flow never reached a real test outcome). The underlying status is
// still in merged-results.json.
//
// Assessment Scope is decided by each result's `tags` (see lib/tags.js), never by its folder:
//   Services = service OR health-check (the 10 core service flows + every service suite),
//   E2E = critical OR happy-path (Main E2E). Flows tagged "service" never appear under E2E.

const fs = require('fs');
const path = require('path');
const { SCOPES, SCOPE_EXCLUDE, RUN_TYPES, runTypeOf, readFlowTags } = require('./lib/tags');
// Service results are SHOWN by scenario name and suite label, never by Jira ID (lib/display-names.js).
const { displayFor, scrubIds } = require('./lib/display-names');

const ROOT = path.resolve(__dirname, '..');
const MERGED = path.join(ROOT, 'test-results', 'merged-results.json');
const CONFIG = path.join(__dirname, 'report.config.json');
const OUT_HTML = path.join(__dirname, 'dashboard.html');

if (!fs.existsSync(MERGED)) {
  console.error('No merged results. Run "npm test" then "npm run merge-results".');
  process.exit(2);
}

const data = JSON.parse(fs.readFileSync(MERGED, 'utf8'));
const config = {
  product: 'Sakani',
  environment: 'Pre-Prod',
  ...(fs.existsSync(CONFIG) ? JSON.parse(fs.readFileSync(CONFIG, 'utf8')) : {}),
};
const reportGeneratedAt = new Date().toLocaleString();

const DISPLAY = { PASS: 'Passed', FAIL: 'Failed', BLOCKED_ENVIRONMENT: 'Skipped', UNRESOLVED: 'Skipped' };

function formatDuration(ms) {
  if (!ms || ms <= 0) return '0s';
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) return `${hours}h ${minutes > 0 ? minutes + 'm ' : ''}${seconds > 0 ? seconds + 's' : ''}`.trim();
  if (minutes > 0) return `${minutes}m ${seconds > 0 ? seconds + 's' : ''}`.trim();
  return `${(ms / 1000).toFixed(2)}s`;
}

const stripAnsi = (s) => String(s).replace(/\x1b\[[0-9;]*[A-Za-z]/g, '');
const OUTCOME = /^(\s*)(.*?)\.\.\.[ \t]*(COMPLETED|FAILED|SKIPPED)[ \t]*$/;
const START = /^(\s*)(.*?)\.\.\.[ \t]*$/;
const STEP_STATUS = { COMPLETED: 'Passed', FAILED: 'Failed', SKIPPED: 'Skipped' };

// Execution steps, exactly as Maestro printed them in the preserved console log. A command that
// has children is printed twice - "<text>..." when it starts and "<text>... <OUTCOME>" when it
// ends (the end line carries the evaluated text) - while a leaf is printed once. Indentation is
// two spaces per nesting level, so a start line is closed by the next outcome line at its depth.
// A start line never closed means the process died inside that step.
function parseLogSteps(log) {
  const steps = [];
  const open = [];
  for (const line of log.split(/\r?\n/)) {
    let m;
    if ((m = OUTCOME.exec(line))) {
      const depth = Math.floor(m[1].length / 2);
      const top = open[open.length - 1];
      if (top && top.depth === depth) {
        top.text = m[2].trim();
        top.outcome = m[3];
        open.pop();
      } else steps.push({ text: m[2].trim(), depth, outcome: m[3] });
    } else if ((m = START.exec(line)) && !/^\s*>/.test(line)) {
      const step = { text: m[2].trim(), depth: Math.floor(m[1].length / 2), outcome: null };
      steps.push(step);
      open.push(step);
    }
  }
  return steps;
}

// Maestro's own per-command record (debug/.../commands.json) carries the real duration and the
// failure message, but not the printed text. It is matched to the log steps in order, and only
// when nesting depth, outcome AND command type all agree - so a duration is never attached to the
// wrong step. commands.json also records every iteration of a repeat loop, which the console
// prints once; those extra entries are passed over rather than guessed at.
const COMMAND_TEXT = {
  assertConditionCommand: /^Assert that /,
  evalScriptCommand: /^Run \$\{/,
  runFlowCommand: /^Run (?!\$\{)/,
  repeatCommand: /^Repeat /,
  tapOnElement: /^Tap on (?!point)/,
  tapOnPointV2Command: /^Tap on point/,
  backPressCommand: /^Press back/,
  swipeCommand: /^Swip/,
  waitForAnimationToEndCommand: /^Wait for animation/,
  launchAppCommand: /^Launch app/,
  inputTextCommand: /^Input text/,
  scrollUntilVisible: /^Scroll/,
  takeScreenshotCommand: /^Take screenshot/,
  assertScreenshotCommand: /^Assert screenshot/,
};
const NOT_PRINTED = new Set(['defineVariablesCommand', 'applyConfigurationCommand']);

function findCommandsJson(flowDir) {
  const debug = path.join(flowDir, 'debug');
  if (!fs.existsSync(debug)) return null;
  const found = fs
    .readdirSync(debug, { recursive: true })
    .filter((f) => path.basename(String(f)) === 'commands.json')
    .map((f) => path.join(debug, String(f)))
    .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
  return found[0] || null;
}

function attachCommandMetadata(steps, commandsFile) {
  if (!commandsFile) return 0;
  let commands;
  try {
    commands = JSON.parse(fs.readFileSync(commandsFile, 'utf8'));
  } catch {
    return 0;
  }
  const cmds = commands
    .map((c) => ({ type: Object.keys(c.command || {})[0], meta: c.metadata || {} }))
    .filter((c) => !NOT_PRINTED.has(c.type))
    .sort((a, b) => (a.meta.sequenceNumber ?? 0) - (b.meta.sequenceNumber ?? 0));

  let next = 0;
  let matched = 0;
  for (const step of steps) {
    for (let j = next; j < cmds.length; j++) {
      const { type, meta } = cmds[j];
      const textOk = COMMAND_TEXT[type] ? COMMAND_TEXT[type].test(step.text) : false;
      if (meta.depth === step.depth && meta.status === (step.outcome || meta.status) && textOk) {
        if (typeof meta.duration === 'number') step.durationMs = meta.duration;
        if (meta.error && meta.error.message) step.error = meta.error.message;
        next = j + 1;
        matched++;
        break;
      }
    }
  }
  return matched;
}

const specs = data.results.map((r, index) => {
  const logFile = r.logPath ? path.join(ROOT, r.logPath) : null;
  const log = logFile && fs.existsSync(logFile) ? stripAnsi(fs.readFileSync(logFile, 'utf8')) : '';
  const status = DISPLAY[r.status] || 'Skipped';

  const parsed = parseLogSteps(log);
  const matched = logFile ? attachCommandMetadata(parsed, findCommandsJson(path.dirname(logFile))) : 0;

  // A failed step with no message from commands.json: use the first paragraph Maestro printed
  // after the last FAILED line in the console log (the error itself, not the generic tips).
  const lines = log.split(/\r?\n/);
  let lastFailedAt = -1;
  lines.forEach((l, i) => /\.\.\.[ \t]*FAILED[ \t]*$/.test(l) && (lastFailedAt = i));
  const consoleError = [];
  for (const l of lastFailedAt >= 0 ? lines.slice(lastFailedAt + 1) : []) {
    if (!l.trim() || /^WARNING:/.test(l)) {
      if (consoleError.length) break;
      continue;
    }
    if (OUTCOME.test(l) || START.test(l)) break;
    consoleError.push(l.trim());
  }
  const innermostFailed = parsed.filter((s) => s.outcome === 'FAILED').pop();
  if (innermostFailed && !innermostFailed.error && consoleError.length)
    innermostFailed.error = consoleError.join('\n');

  const shown = displayFor(r, ROOT);
  const visible = (x) => (shown.service && x ? scrubIds(x) : x);
  const steps = parsed.map((s) => ({
    t: visible(s.text),
    s: s.outcome ? STEP_STATUS[s.outcome] : 'Not finished',
    d: s.depth,
    ms: s.durationMs ?? null,
    e: visible(s.error) || null,
  }));

  if (process.env.DASHBOARD_DEBUG)
    console.log(`${r.flow}: ${steps.length} log steps, ${matched} matched to commands.json`);

  return {
    id: `tc-${index + 1}`,
    // Display only: a service flow is shown by suite label + scenario name; its Jira ID stays internal.
    suite: shown.suite,
    title: shown.title,
    // Run Type classification comes from the tags recorded in the result data - never from the
    // folder, file name or title.
    tags: Array.isArray(r.tags) ? r.tags : [],
    // Run Type = test purpose (lib/tags.js RUN_TYPES), read from the flow file's CURRENT tags so a result
    // recorded before a reclassification is still shown under today's Run Type; falls back to the
    // recorded tags when the file is gone.
    runType: runTypeOf(r.file && fs.existsSync(path.join(ROOT, r.file))
      ? readFlowTags(path.join(ROOT, r.file))
      : (Array.isArray(r.tags) ? r.tags : [])) || 'Unclassified',
    durationMs: r.durationMs || 0,
    durationStr: formatDuration(r.durationMs || 0),
    status,
    steps,
  };
});

const productKey = config.product;
// Totals are computed in the page per Assessment Scope, from each spec's tags.
const productData = {
  [productKey]: {
    product: productKey,
    environment: config.environment,
    specs,
  },
};

// JSON inside a <script> block: neutralise "</script>" and friends.
const embed = (v) => JSON.stringify(v, null, 2).replace(/</g, '\\u003c');
const esc = (s) =>
  String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const htmlContent = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${esc(productKey)} Mobile Test Dashboard</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
  <style>
    html, body {
      overflow-y: scroll !important;
      -ms-overflow-style: scrollbar !important;
      scrollbar-width: auto !important;
    }

    ::-webkit-scrollbar {
      display: block !important;
      width: 10px !important;
      height: 10px !important;
    }

    ::-webkit-scrollbar-track {
      background: #f1f5f9 !important;
    }

    ::-webkit-scrollbar-thumb {
      background: #cbd5e1 !important;
      border-radius: 4px !important;
    }

    ::-webkit-scrollbar-thumb:hover {
      background: #166242 !important;
    }
  </style>
</head>
<body class="bg-slate-50 text-slate-800 min-h-screen p-6 font-sans">
  <div class="max-w-7xl mx-auto space-y-6">

    <header class="flex flex-col md:flex-row md:items-center justify-between pb-6 border-b border-slate-200 gap-4">
      <div>
        <h1 class="text-2xl font-bold tracking-wide" style="color: #166242;">${esc(productKey)} Mobile Automation Dashboard</h1>
      </div>

      <!-- Single Button Pill Product Filter -->
      <div class="relative inline-block text-left w-full sm:w-auto min-w-[220px]" id="productDropdownContainer">
        <button id="productDropdownBtn" onclick="toggleDropdown('productDropdownMenu')" class="w-full bg-[#166242] hover:bg-[#125036] text-white font-semibold text-sm rounded-xl px-4 py-2 border-2 border-slate-200/60 focus:outline-none focus:ring-2 focus:ring-emerald-600/40 cursor-pointer transition-all shadow-sm flex items-center justify-between gap-2.5">
          <div class="flex items-center gap-2 truncate">
            <svg class="w-4 h-4 text-white shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M3 6h10M3 10h8M3 14h6M3 18h4M17 6v12m0 0l-3-3m3 3l3-3"></path>
            </svg>
            <span class="truncate">Product: <strong id="productDropdownSelected" class="font-bold">${esc(productKey)}</strong></span>
          </div>
          <svg class="w-3.5 h-3.5 text-white shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        <div id="productDropdownMenu" class="hidden absolute left-0 right-0 w-full mt-1.5 rounded-xl shadow-lg bg-white border border-slate-200 ring-1 ring-black ring-opacity-5 z-50 overflow-hidden">
          ${Object.keys(productData).map((key) => `
            <div onclick="selectProductOption('${esc(key)}')" class="px-4 py-2.5 text-xs font-bold text-slate-700 hover:bg-[#166242] hover:text-white cursor-pointer transition-colors flex items-center justify-between">
              <span>${esc(productData[key].product)}</span>
            </div>
          `).join('')}
        </div>
      </div>
    </header>

    <div class="bg-white border border-slate-200 rounded-xl p-5 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
      <div>
        <h2 class="text-sm font-bold tracking-wide" style="color: #166242;">Assessment Scope</h2>
        <p class="text-xs text-slate-500 mt-0.5">Filter metrics by service flows (Services) or Main E2E journeys (E2E)</p>
      </div>
      <div class="flex items-center gap-3">
        <button id="btnServices" onclick="setExecutionMode('services')" class="px-5 py-2 text-xs font-bold rounded-lg transition-all border border-emerald-700 bg-[#166242] text-white shadow-sm">
          Services
        </button>
        <button id="btnE2e" onclick="setExecutionMode('e2e')" class="px-5 py-2 text-xs font-bold rounded-lg transition-all border border-emerald-700 text-emerald-800 bg-white hover:bg-emerald-50 shadow-sm">
          E2E
        </button>
      </div>
    </div>

    <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      <div class="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
        <p class="text-xs font-bold text-slate-500 tracking-wider">Total Test Cases</p>
        <p id="totalExecuted" class="text-3xl font-extrabold text-slate-900 mt-2">0</p>
      </div>

      <div class="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
        <p class="text-xs font-bold text-emerald-600 tracking-wider">Passed</p>
        <p id="passedCount" class="text-3xl font-extrabold text-emerald-600 mt-2">0</p>
      </div>

      <div class="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
        <p class="text-xs font-bold text-rose-600 tracking-wider">Failed</p>
        <p id="failedCount" class="text-3xl font-extrabold text-rose-600 mt-2">0</p>
      </div>

      <div class="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
        <p class="text-xs font-bold text-amber-600 tracking-wider">Skipped</p>
        <p id="skippedCount" class="text-3xl font-extrabold text-amber-600 mt-2">0</p>
      </div>
    </div>

    <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div class="bg-white border border-slate-200 rounded-xl p-5 shadow-sm flex flex-col justify-between">
        <h2 class="text-base font-bold mb-2" style="color: #166242;">Execution Ratio</h2>

        <div class="relative flex items-center justify-center h-48">
          <canvas id="statusChart"></canvas>
        </div>

        <div id="customLegend" class="flex items-center justify-center gap-6 mt-4 pt-3 border-t border-slate-100"></div>
      </div>

      <div class="lg:col-span-2 bg-white border border-slate-200 rounded-xl p-5 shadow-sm flex flex-col justify-between">
        <h2 class="text-base font-bold mb-4" style="color: #166242;">Test Run Information</h2>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">

          <div class="sm:col-span-2 bg-slate-50 p-4 rounded-lg border border-slate-200 h-auto">
            <p class="text-slate-500 text-xs font-bold">Suites Scope</p>
            <p id="suitesScopeValue" class="font-semibold text-slate-800 mt-1 leading-relaxed break-words">-</p>
          </div>

          <div class="sm:col-span-2 bg-slate-50 p-4 rounded-lg border border-slate-200 h-auto">
            <p class="text-slate-500 text-xs font-bold">Run Type</p>
            <p id="runTypeValue" class="font-semibold text-slate-800 mt-1 leading-relaxed break-words">-</p>
          </div>

          <div class="bg-slate-50 p-4 rounded-lg border border-slate-200">
            <p class="text-slate-500 text-xs font-bold">Product Scope</p>
            <p id="productScopeValue" class="font-semibold text-slate-800 mt-1">-</p>
          </div>
          <div class="bg-slate-50 p-4 rounded-lg border border-slate-200">
            <p class="text-slate-500 text-xs font-bold">Environment</p>
            <p id="environmentValue" class="font-semibold text-slate-800 mt-1">Pre-Prod</p>
          </div>
          <div class="bg-slate-50 p-4 rounded-lg border border-slate-200">
            <p class="text-slate-500 text-xs font-bold">Total Duration</p>
            <p id="tagDurationValue" class="font-semibold text-indigo-600 mt-1">0s</p>
          </div>
          <div class="bg-slate-50 p-4 rounded-lg border border-slate-200">
            <p class="text-slate-500 text-xs font-bold">Report Generated At</p>
            <p class="font-semibold text-slate-800 mt-1">${esc(reportGeneratedAt)}</p>
          </div>
        </div>
      </div>
    </div>

    <div class="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
      <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4 pb-3 border-b border-slate-100">
        <h2 class="text-base font-bold" style="color: #166242;">Test Cases (<span id="tableTagTitle">-</span>)</h2>

        <!-- Single Button Pill Status Filter -->
        <div class="relative inline-block text-left w-full sm:w-auto min-w-[180px]" id="statusDropdownContainer">
          <button id="statusDropdownBtn" onclick="toggleDropdown('statusDropdownMenu')" class="w-full bg-[#166242] hover:bg-[#125036] text-white font-semibold text-sm rounded-xl px-4 py-2 border-2 border-slate-200/60 focus:outline-none focus:ring-2 focus:ring-emerald-600/40 cursor-pointer transition-all shadow-sm flex items-center justify-between gap-2.5">
            <div class="flex items-center gap-2 truncate">
              <svg class="w-4 h-4 text-white shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M3 6h10M3 10h8M3 14h6M3 18h4M17 6v12m0 0l-3-3m3 3l3-3"></path>
              </svg>
              <span class="truncate">Status: <strong id="statusDropdownSelected" class="font-bold">All</strong></span>
            </div>
            <svg class="w-3.5 h-3.5 text-white shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          <div id="statusDropdownMenu" class="hidden absolute left-0 right-0 w-full mt-1.5 rounded-xl shadow-lg bg-white border border-slate-200 ring-1 ring-black ring-opacity-5 z-50 overflow-hidden">
            <div onclick="selectStatusOption('all', 'All')" class="px-4 py-2.5 text-xs font-bold text-slate-700 hover:bg-[#166242] hover:text-white cursor-pointer transition-colors">All</div>
            <div onclick="selectStatusOption('passed', 'Passed')" class="px-4 py-2.5 text-xs font-bold text-slate-700 hover:bg-[#166242] hover:text-white cursor-pointer transition-colors">Passed</div>
            <div onclick="selectStatusOption('failed', 'Failed')" class="px-4 py-2.5 text-xs font-bold text-slate-700 hover:bg-[#166242] hover:text-white cursor-pointer transition-colors">Failed</div>
            <div onclick="selectStatusOption('skipped', 'Skipped')" class="px-4 py-2.5 text-xs font-bold text-slate-700 hover:bg-[#166242] hover:text-white cursor-pointer transition-colors">Skipped</div>
          </div>
        </div>

      </div>

      <div class="overflow-x-auto">
        <table class="w-full text-left text-sm text-slate-700 table-fixed">
          <thead class="bg-slate-100 text-slate-500 text-xs font-bold border-b border-slate-200">
            <tr>
              <th class="py-3 px-4 font-bold w-[25%]">Suite</th>
              <th class="py-3 px-4 font-bold w-[50%]">Test Case</th>
              <th class="py-3 px-4 font-bold w-[12%] text-center">Duration</th>
              <th class="py-3 px-4 font-bold w-[13%] text-center">Status</th>
            </tr>
          </thead>
          <tbody id="testCasesTable" class="divide-y divide-slate-200"></tbody>
        </table>
      </div>
    </div>

  </div>

  <script>
    const productData = ${embed(productData)};

    // Assessment Scope = tag membership, nothing else:
    //   Services -> tags contain "service" OR "health-check"
    //   E2E      -> tags contain "critical" OR "happy-path"
    // and never a tag listed for that scope in SCOPE_EXCLUDE (service flows stay out of E2E).
    const SCOPES = ${embed(SCOPES)};
    const SCOPE_EXCLUDE = ${embed(SCOPE_EXCLUDE)};
    const inScope = (tags, k) => (SCOPES[k] || []).some(t => (tags || []).includes(t)) &&
      !(SCOPE_EXCLUDE[k] || []).some(t => (tags || []).includes(t));
    let currentMode = 'services';
    let currentStatusFilter = 'all';
    let selectedProductKey = ${JSON.stringify(productKey).replace(/</g, '\\u003c')};
    let chartInstance = null;

    const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

    function toggleDropdown(menuId) {
      const menu = document.getElementById(menuId);
      const isHidden = menu.classList.contains('hidden');
      closeAllDropdowns();
      if (isHidden) {
        menu.classList.remove('hidden');
      }
    }

    function closeAllDropdowns() {
      document.getElementById('productDropdownMenu').classList.add('hidden');
      document.getElementById('statusDropdownMenu').classList.add('hidden');
    }

    document.addEventListener('click', function(event) {
      const pContainer = document.getElementById('productDropdownContainer');
      const sContainer = document.getElementById('statusDropdownContainer');
      if (!pContainer.contains(event.target) && !sContainer.contains(event.target)) {
        closeAllDropdowns();
      }
    });

    function selectProductOption(key) {
      selectedProductKey = key;
      document.getElementById('productDropdownSelected').innerText = key;
      closeAllDropdowns();
      renderDashboard(selectedProductKey);
    }

    function selectStatusOption(value, label) {
      currentStatusFilter = value;
      document.getElementById('statusDropdownSelected').innerText = label;
      closeAllDropdowns();
      renderDashboard(selectedProductKey);
    }

    const fmtMs = (ms) => {
      if (ms == null) return '';
      if (ms < 1000) return ms + 'ms';
      const s = ms / 1000;
      return s < 60 ? s.toFixed(1) + 's' : Math.floor(s / 60) + 'm ' + Math.round(s % 60) + 's';
    };

    const STEP_STYLE = {
      Passed: { icon: '\\u2713', icon_cls: 'text-emerald-600', label: 'text-emerald-700', row: '' },
      Failed: { icon: '\\u2717', icon_cls: 'text-rose-600', label: 'text-rose-700', row: 'bg-rose-50' },
      Skipped: { icon: '\\u2013', icon_cls: 'text-slate-400', label: 'text-slate-400', row: '' },
      'Not finished': { icon: '!', icon_cls: 'text-amber-600', label: 'text-amber-700', row: 'bg-amber-50' },
    };

    function stepsHtml(spec) {
      return spec.steps.map((step) => {
        const st = STEP_STYLE[step.s] || STEP_STYLE.Skipped;
        return \`
          <li class="py-1.5 px-2 border-b border-slate-100 last:border-0 \${st.row}">
            <div class="flex items-start gap-2 text-xs" style="padding-left: \${step.d * 16}px">
              <span class="font-bold w-3 shrink-0 text-center \${st.icon_cls}">\${st.icon}</span>
              <span class="flex-1 min-w-0 break-words whitespace-normal \${step.s === 'Skipped' ? 'text-slate-400' : 'text-slate-800'}">\${esc(step.t)}</span>
              <span class="shrink-0 w-20 text-right font-semibold \${st.label}">\${esc(step.s)}</span>
              <span class="shrink-0 w-16 text-right font-mono text-[11px] text-slate-500">\${fmtMs(step.ms)}</span>
            </div>
            \${step.e ? \`<div class="mt-1 text-xs text-rose-700 font-mono whitespace-pre-wrap break-words" style="padding-left: \${step.d * 16 + 20}px">Failure: \${esc(step.e)}</div>\` : ''}
          </li>\`;
      }).join('');
    }

    let openSpecId = null;

    function toggleSteps(specId) {
      const wasOpen = openSpecId === specId;
      // Only one expanded row at a time.
      document.querySelectorAll('tr[data-steps-for]').forEach((r) => r.remove());
      document.querySelectorAll('[data-caret]').forEach((c) => (c.textContent = '\\u25B8'));
      openSpecId = null;
      if (wasOpen) return;

      const spec = productData[selectedProductKey].specs.find((s) => s.id === specId);
      const row = document.querySelector(\`tr[data-spec="\${specId}"]\`);
      if (!spec || !row) return;

      const counts = spec.steps.reduce((a, s) => ((a[s.s] = (a[s.s] || 0) + 1), a), {});
      const summary = ['Passed', 'Failed', 'Skipped', 'Not finished']
        .filter((k) => counts[k]).map((k) => counts[k] + ' ' + k.toLowerCase()).join(' \\u00B7 ');

      row.insertAdjacentHTML('afterend', \`
        <tr data-steps-for="\${specId}" class="bg-slate-100/70 border-b border-slate-200">
          <td colspan="4" class="py-3 px-6">
            <div class="bg-white rounded-lg border border-slate-200 p-3 shadow-inner">
              <p class="text-xs font-bold mb-2 pb-1 border-b border-slate-100 \${spec.status === 'Failed' ? 'text-rose-700' : 'text-slate-700'}">
                Execution Steps <span class="font-medium text-slate-500">(\${spec.steps.length} \\u00B7 \${summary})</span>
              </p>
              <ul class="max-h-[480px] overflow-y-auto">\${stepsHtml(spec)}</ul>
            </div>
          </td>
        </tr>\`);
      const caret = row.querySelector('[data-caret]');
      if (caret) caret.textContent = '\\u25BE';
      openSpecId = specId;
    }

    // Same format as the per-row durations.
    function formatTotal(ms) {
      if (!ms || ms <= 0) return '0s';
      const totalSeconds = Math.floor(ms / 1000);
      const hours = Math.floor(totalSeconds / 3600);
      const minutes = Math.floor((totalSeconds % 3600) / 60);
      const seconds = totalSeconds % 60;
      if (hours > 0) return \`\${hours}h \${minutes > 0 ? minutes + 'm ' : ''}\${seconds > 0 ? seconds + 's' : ''}\`.trim();
      if (minutes > 0) return \`\${minutes}m \${seconds > 0 ? seconds + 's' : ''}\`.trim();
      return (ms / 1000).toFixed(2) + 's';
    }

    function setExecutionMode(mode) {
      currentMode = mode;
      const on = "px-5 py-2 text-xs font-bold rounded-lg transition-all border border-emerald-700 bg-[#166242] text-white shadow-sm";
      const off = "px-5 py-2 text-xs font-bold rounded-lg transition-all border border-emerald-700 text-emerald-800 bg-white hover:bg-emerald-50 shadow-sm";
      document.getElementById('btnServices').className = mode === 'services' ? on : off;
      document.getElementById('btnE2e').className = mode === 'e2e' ? on : off;
      renderDashboard(selectedProductKey);
    }

    function renderDashboard(productKey) {
      const availableKeys = Object.keys(productData);
      const targetKey = productData[productKey] ? productKey : availableKeys[0];
      const data = productData[targetKey];

      if (!data) {
        document.getElementById("testCasesTable").innerHTML = \`<tr><td colspan="4" class="py-6 text-center text-slate-400 font-medium">No test cases available.</td></tr>\`;
        return;
      }

      // Only the test cases whose TAGS put them in the selected Assessment Scope.
      const scopedSpecs = data.specs.filter(spec => inScope(spec.tags, currentMode));

      const total = scopedSpecs.length;
      const passed = scopedSpecs.filter(s => s.status === 'Passed').length;
      const failed = scopedSpecs.filter(s => s.status === 'Failed').length;
      const skipped = scopedSpecs.filter(s => s.status === 'Skipped').length;

      document.getElementById("totalExecuted").innerText = total;
      document.getElementById("passedCount").innerText = passed;
      document.getElementById("failedCount").innerText = failed;
      document.getElementById("skippedCount").innerText = skipped;
      document.getElementById("tableTagTitle").innerText = data.product;

      // Suites Scope = the Assessment Scope(s) of the shown test cases, from the same SCOPES tag mapping as
      // the view filter (service/health-check -> Services, critical/happy-path -> E2E). Not the folder-based
      // suite field, and generic tags (e2e, eligibility, appeal...) never contribute.
      const SCOPE_LABELS = { services: 'Services', e2e: 'E2E' };
      document.getElementById("suitesScopeValue").innerText = Object.keys(SCOPES)
        .filter(k => scopedSpecs.some(s => inScope(s.tags, k)))
        .map(k => SCOPE_LABELS[k] || k)
        .join(' + ') || 'None';
      // Run Type = test purpose (Health Check / Release Readiness), counted over the shown test cases.
      const RUN_TYPE_LABELS = ${embed(Object.values(RUN_TYPES))};
      document.getElementById("runTypeValue").innerText = RUN_TYPE_LABELS
        .map(l => l + ': ' + scopedSpecs.filter(s => s.runType === l).length)
        .concat(scopedSpecs.some(s => !RUN_TYPE_LABELS.includes(s.runType)) ? ['Unclassified: ' + scopedSpecs.filter(s => !RUN_TYPE_LABELS.includes(s.runType)).length] : [])
        .join('  \\u00B7  ');
      document.getElementById("productScopeValue").innerText = data.product;
      document.getElementById("environmentValue").innerText = data.environment || 'Pre-Prod';
      document.getElementById("tagDurationValue").innerText = formatTotal(scopedSpecs.reduce((n, s) => n + (s.durationMs || 0), 0));

      const tableBody = document.getElementById("testCasesTable");
      tableBody.innerHTML = "";

      const filteredSpecs = scopedSpecs.filter(spec => {
        if (currentStatusFilter === 'passed') return spec.status === 'Passed';
        if (currentStatusFilter === 'failed') return spec.status === 'Failed';
        if (currentStatusFilter === 'skipped') return spec.status === 'Skipped';
        return true;
      });

      if (filteredSpecs.length === 0) {
        tableBody.innerHTML = \`<tr><td colspan="4" class="py-6 text-center text-slate-400 font-medium">No test cases found for this status filter.</td></tr>\`;
      } else {
        filteredSpecs.forEach(spec => {
          let statusBadgeClass = "bg-amber-100 text-amber-800 border-amber-300";
          if (spec.status === "Passed") statusBadgeClass = "bg-emerald-100 text-emerald-800 border-emerald-300";
          if (spec.status === "Failed") statusBadgeClass = "bg-rose-100 text-rose-800 border-rose-300";

          const hasSteps = spec.steps && spec.steps.length > 0;

          const cursorClass = hasSteps ? "cursor-pointer hover:bg-slate-100/80" : "hover:bg-slate-50";
          const clickAttr = hasSteps ? \`onclick="toggleSteps('\${spec.id}')"\` : "";

          const row = \`
            <tr data-spec="\${spec.id}" \${clickAttr} class="transition-colors \${cursorClass}">
              <td class="py-3.5 px-4 font-mono text-xs text-slate-600 break-words whitespace-normal">\${esc(spec.suite)}</td>
              <td class="py-3.5 px-4 font-medium text-slate-900 break-words whitespace-normal">
                <div class="flex items-center gap-2">
                  \${hasSteps ? \`<span data-caret class="text-slate-400 text-xs w-3">\${openSpecId === spec.id ? '\\u25BE' : '\\u25B8'}</span>\` : ''}
                  <span>\${esc(spec.title)}</span>
                  <span class="text-[10px] font-bold border rounded px-1.5 py-0.5 \${spec.runType === 'Release Readiness' ? 'text-indigo-700 bg-indigo-50 border-indigo-200' : 'text-teal-700 bg-teal-50 border-teal-200'}">\${esc(spec.runType)}</span>
                  \${hasSteps ? \`<span class="text-[10px] font-bold \${spec.status === 'Failed' ? 'text-rose-600 bg-rose-50 border-rose-200' : 'text-slate-500 bg-slate-50 border-slate-200'} border rounded px-1.5 py-0.5">Click to view steps</span>\` : ''}
                </div>
              </td>
              <td class="py-3.5 px-4 text-slate-600 font-mono text-xs text-center break-words whitespace-normal">\${esc(spec.durationStr)}</td>
              <td class="py-3.5 px-4 text-center">
                <span class="inline-block px-2.5 py-1 text-xs font-semibold border rounded-full \${statusBadgeClass}">
                  \${esc(spec.status)}
                </span>
              </td>
            </tr>
          \`;
          tableBody.insertAdjacentHTML('beforeend', row);
        });
      }

      // Keep the expanded row open across a filter change if it is still listed.
      if (openSpecId) {
        const id = openSpecId;
        openSpecId = null;
        if (document.querySelector(\`tr[data-spec="\${id}"]\`)) toggleSteps(id);
      }

      const passedPct = total > 0 ? ((passed / total) * 100).toFixed(1) + '%' : '0.0%';
      const failedPct = total > 0 ? ((failed / total) * 100).toFixed(1) + '%' : '0.0%';
      const skippedPct = total > 0 ? ((skipped / total) * 100).toFixed(1) + '%' : '0.0%';

      const legendContainer = document.getElementById('customLegend');
      legendContainer.innerHTML = \`
        <div class="flex flex-col items-center text-center">
          <div class="flex items-center gap-1.5">
            <span class="w-3 h-3 rounded-sm bg-[#10B981] inline-block"></span>
            <span class="text-xs font-semibold" style="color: #166242;">Passed</span>
          </div>
          <span class="text-sm font-bold text-slate-900 mt-0.5">\${passedPct}</span>
        </div>

        <div class="flex flex-col items-center text-center">
          <div class="flex items-center gap-1.5">
            <span class="w-3 h-3 rounded-sm bg-[#EF4444] inline-block"></span>
            <span class="text-xs font-semibold" style="color: #166242;">Failed</span>
          </div>
          <span class="text-sm font-bold text-slate-900 mt-0.5">\${failedPct}</span>
        </div>

        <div class="flex flex-col items-center text-center">
          <div class="flex items-center gap-1.5">
            <span class="w-3 h-3 rounded-sm bg-[#F59E0B] inline-block"></span>
            <span class="text-xs font-semibold" style="color: #166242;">Skipped</span>
          </div>
          <span class="text-sm font-bold text-slate-900 mt-0.5">\${skippedPct}</span>
        </div>
      \`;

      if (chartInstance) chartInstance.destroy();

      const ctx = document.getElementById('statusChart').getContext('2d');
      chartInstance = new Chart(ctx, {
        type: 'doughnut',
        data: {
          labels: ['Passed', 'Failed', 'Skipped'],
          datasets: [{
            data: [passed, failed, skipped],
            backgroundColor: ['#10B981', '#EF4444', '#F59E0B'],
            borderWidth: 2,
            borderColor: '#FFFFFF'
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            tooltip: {
              callbacks: {
                label: function(context) {
                  const label = context.label || '';
                  const value = context.raw || 0;
                  const totalVal = context.dataset.data.reduce((a, b) => a + b, 0);
                  const percentage = totalVal > 0 ? ((value / totalVal) * 100).toFixed(1) + '%' : '0.0%';
                  return \`\${label}: \${value} (\${percentage})\`;
                }
              }
            }
          },
          cutout: '60%'
        }
      });
    }

    // Default Assessment Scope: Services.
    setExecutionMode('services');
  </script>
</body>
</html>`;

fs.writeFileSync(OUT_HTML, htmlContent);
console.log(`-> ${path.relative(ROOT, OUT_HTML)}`);
