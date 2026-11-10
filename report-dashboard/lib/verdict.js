'use strict';
// Single source of truth for turning a finished Maestro run into a verdict.
//
// THE RULE (do not change without the test owner's agreement): a flow PASSES only when the
// process exit code is 0 AND no real step in its log is marked FAILED. Anything else is a
// failure. A verdict is NEVER taken from a summary line such as "[Passed]" - Maestro's console
// summary has been unreliable here, and a runner that records its own labels cannot be audited
// after the fact. Every verdict below is re-derived from the preserved raw log.

// Maestro prints a failed step as "<step description>... FAILED" at end of line.
const FAILED_STEP = /\.\.\.[ \t]*FAILED[ \t]*$/;

// Environment failures that mean the flow never really executed. These must not be reported as
// test failures - they are not evidence about the product.
const ENV_SIGNATURES = [
  { re: /Failure calling service package/i, why: 'device package service unavailable' },
  { re: /Broken pipe/i, why: 'adb pipe to the device broke' },
  { re: /Can't find service: (activity|package)/i, why: 'device system services unavailable' },
  { re: /isn'?t responding/i, why: 'application ANR' },
  { re: /Fatal signal \d+ \(SIG/i, why: 'application crashed (native fatal signal)' },
  { re: /Unable to (launch|find) (the )?(app|device)/i, why: 'app or device not reachable' },
  { re: /no devices? (found|connected)/i, why: 'no device connected' },
];

function stripAnsi(s) {
  return String(s).replace(/\x1b\[[0-9;]*[A-Za-z]/g, '');
}

/**
 * @param {{exitCode:number|null, log:string}} run
 * @returns {{status:string, exitCode:number|null, failedSteps:number,
 *            firstFailure:string|null, envReason:string|null, npsAppearances:number}}
 */
function deriveVerdict(run) {
  const log = stripAnsi(run.log || '');
  const lines = log.split(/\r?\n/);

  const failedLines = lines.filter((l) => FAILED_STEP.test(l));
  const firstFailure = failedLines.length ? failedLines[0].trim() : null;

  // Informational only. The known NPS survey is a product defect that automation absorbs; its
  // recurrence must NEVER influence the verdict. Counted from the shared handler's own marker.
  const npsAppearances = (log.match(/NPS KNOWN DEFECT - dismissed/g) || []).length;

  const stepsRan = lines.some((l) => /\.\.\.[ \t]*(COMPLETED|FAILED|SKIPPED)[ \t]*$/.test(l));
  const env = ENV_SIGNATURES.find((s) => s.re.test(log));

  // A step that STARTED and never reported COMPLETED/FAILED/SKIPPED means the process died
  // part-way through it. Maestro prints the step twice: once ending in "..." when it begins, then
  // again with its outcome. A trailing unterminated one is the signature of a killed or crashed
  // run - seen on 27/09/2026 when the app crashed during "Launch app with clear state".
  const stepStarts = lines.filter((l) => /\.\.\.[ \t]*$/.test(l));
  const dangling =
    stepStarts.length > 0 && !/\.\.\.[ \t]*(COMPLETED|FAILED|SKIPPED)[ \t]*$/.test(
      [...lines].reverse().find((l) => /\.\.\.[ \t]*(COMPLETED|FAILED|SKIPPED|)[ \t]*$/.test(l)) || ''
    );

  let status;
  let envReason = env ? env.why : null;

  if (run.exitCode === null || run.exitCode === undefined) {
    // No exit code was preserved, so half of the rule is missing. Never call this a pass.
    status = 'UNRESOLVED';
  } else if (env && (failedLines.length === 0 || !stepsRan)) {
    status = 'BLOCKED_ENVIRONMENT';
  } else if (run.exitCode === 0 && failedLines.length === 0) {
    status = 'PASS';
  } else if (failedLines.length > 0) {
    // A real step failed. This is the only thing that may be reported as a test failure.
    status = 'FAIL';
  } else {
    // Non-zero exit but NOT ONE step is marked FAILED: the run died for a reason that is not a
    // test outcome (killed, crashed, device lost). Reporting this as FAIL would blame the product
    // for an environment death, so it is blocked/unresolved instead.
    status = dangling || !stepsRan ? 'BLOCKED_ENVIRONMENT' : 'UNRESOLVED';
    if (!envReason)
      envReason = dangling
        ? 'run ended part-way through a step - process killed or crashed'
        : !stepsRan
        ? 'no step executed'
        : null;
  }

  return {
    status,
    exitCode: run.exitCode === undefined ? null : run.exitCode,
    failedSteps: failedLines.length,
    firstFailure,
    envReason,
    npsAppearances,
  };
}

module.exports = { deriveVerdict, stripAnsi, FAILED_STEP, ENV_SIGNATURES };
