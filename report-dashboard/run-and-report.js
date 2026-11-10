'use strict';
// Run Maestro, then ALWAYS build the report, then exit with the TEST result.
//
//   node report-dashboard/run-and-report.js <exactly the arguments for run-maestro.js>
//
// Replaces "run-maestro.js ... && npm run post-test": with "&&" a failed run (exit 1) never reached
// the report, so the dashboard kept showing the previous state. Shell operators behave differently
// in Windows cmd and POSIX shells, so the orchestration lives here, in Node, with no shell at all.
//
// 1. run-maestro.js with the received arguments, unchanged (stdio inherited).
// 2. The existing report pipeline, unchanged - the same two steps "npm run post-test" runs, in the
//    same order and with the same rule: merge-results.js, then generate-dashboard.js only if the
//    merge succeeded.
// 3. Exit code: the runner's result owns it. A failed run stays failed even when the report is
//    built fine; a passed run with a failed report is non-zero; both failing is non-zero.
//
// Stale-output guard: run-maestro.js can stop before executing anything (unhealthy device -> exit 2,
// or --list -> exit 0) and then leaves the PREVIOUS run's output in place. Reporting that would
// publish old results as new, so the report is built only when this invocation produced a fresh
// maestro-output/run.json; otherwise the reason is printed and the runner's code is returned.

const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const HERE = __dirname;
const RUN_JSON = path.join(HERE, 'maestro-output', 'run.json');

function node(script, args = []) {
  const r = spawnSync(process.execPath, [path.join(HERE, script), ...args], { stdio: 'inherit' });
  if (r.error) {
    console.error(`run-and-report: could not start ${script}: ${r.error.message}`);
    return 1;
  }
  // A signal-terminated child has status null: treat it as a failure, never as success.
  return r.status === null ? 1 : r.status;
}

const startedAt = Date.now();
const runnerCode = node('run-maestro.js', process.argv.slice(2));

let reportCode = 0;
let freshRun = false;
try {
  freshRun = fs.statSync(RUN_JSON).mtimeMs >= startedAt;
} catch {
  freshRun = false;
}

if (freshRun) {
  console.log('\nrun-and-report: building the report (merge-results -> generate-dashboard)...');
  reportCode = node('merge-results.js');
  if (reportCode === 0) reportCode = node('generate-dashboard.js');
  if (reportCode !== 0) console.error(`run-and-report: REPORT GENERATION FAILED (exit ${reportCode}).`);
} else {
  console.log('\nrun-and-report: no new run output from this invocation (nothing executed) - report not rebuilt, ' +
    'so the previous results are not republished as new.');
}

const finalCode = runnerCode !== 0 ? runnerCode : reportCode;
console.log(`run-and-report: runner exit ${runnerCode}, report ${freshRun ? `exit ${reportCode}` : 'skipped'} -> exit ${finalCode}`);
process.exit(finalCode);
