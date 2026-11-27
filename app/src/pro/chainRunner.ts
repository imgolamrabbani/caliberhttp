import { executeHttpRequest, type ExecuteOptions } from '../core/httpExecutor.js';
import {
  evaluateJsonPath,
  interpolateRequest,
  type InterpolationContext,
} from '../core/interpolator.js';
import type {
  AssertionResult,
  AssertionRule,
  ChainRunReport,
  ChainStepResult,
  ExecutionResult,
  HttpRequestBlock,
} from '../core/types.js';

export function evaluateAssertion(
  rule: AssertionRule,
  result: ExecutionResult
): AssertionResult {
  let actual: unknown;

  if (rule.target === 'status') {
    actual = result.status;
  } else if (rule.target === 'latency') {
    actual = result.durationMs;
  } else if (rule.target.startsWith('header.')) {
    const headerKey = rule.target.slice(7).toLowerCase();
    for (const [k, v] of Object.entries(result.headers)) {
      if (k.toLowerCase() === headerKey) {
        actual = v;
        break;
      }
    }
  } else if (rule.target.startsWith('body.')) {
    const pathExpr = rule.target.slice(5);
    let source = result.bodyJson;
    if (source === undefined && result.bodyText) {
      try {
        source = JSON.parse(result.bodyText);
      } catch {
        source = result.bodyText;
      }
    }
    actual = evaluateJsonPath(source, pathExpr);
  }

  let passed = false;
  switch (rule.operator) {
    case 'exists':
      passed = actual !== undefined && actual !== null;
      break;
    case '==':
      passed = looseCompare(actual, rule.expected);
      break;
    case '!=':
      passed = !looseCompare(actual, rule.expected);
      break;
    case '<':
      passed = Number(actual) < Number(rule.expected);
      break;
    case '<=':
      passed = Number(actual) <= Number(rule.expected);
      break;
    case '>':
      passed = Number(actual) > Number(rule.expected);
      break;
    case '>=':
      passed = Number(actual) >= Number(rule.expected);
      break;
    case 'contains':
      if (Array.isArray(actual)) {
        passed = actual.some((item) => looseCompare(item, rule.expected));
      } else if (actual !== undefined && actual !== null) {
        passed = String(actual)
          .toLowerCase()
          .includes(String(rule.expected ?? '').toLowerCase());
      }
      break;
  }

  const expr =
    rule.operator === 'exists'
      ? `${rule.target} exists`
      : `${rule.target} ${rule.operator} ${String(rule.expected)}`;

  return {
    rule,
    passed,
    actual,
    message: passed
      ? `PASS: ${expr}`
      : `FAIL: ${expr} (actual: ${formatActual(actual)})`,
  };
}

function looseCompare(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a === 'number' && typeof b === 'string' && b.trim() !== '') {
    return a === Number(b);
  }
  if (typeof b === 'number' && typeof a === 'string' && a.trim() !== '') {
    return Number(a) === b;
  }
  return String(a) === String(b);
}

function formatActual(val: unknown): string {
  if (val === undefined) return 'undefined';
  if (val === null) return 'null';
  if (typeof val === 'object') {
    const s = JSON.stringify(val);
    return s.length > 80 ? `${s.slice(0, 77)}...` : s;
  }
  return String(val);
}

export interface ChainRunnerOptions {
  collectionName?: string;
  interpolation?: InterpolationContext;
  executeOptions?: Omit<ExecuteOptions, 'interpolation'>;
  stopOnFailure?: boolean;
  onStepComplete?: (step: ChainStepResult, index: number, total: number) => void;
}

export async function runRequestChain(
  requests: HttpRequestBlock[],
  options: ChainRunnerOptions = {}
): Promise<ChainRunReport> {
  const startedAtIso = new Date().toISOString();
  const startPerf = performance.now();
  const stepResults: Record<string, ExecutionResult> = {
    ...(options.interpolation?.stepResults ?? {}),
  };

  const steps: ChainStepResult[] = [];
  let passedSteps = 0;
  let failedSteps = 0;
  let totalAssertions = 0;
  let passedAssertions = 0;
  let failedAssertions = 0;

  for (let i = 0; i < requests.length; i++) {
    const rawReq = requests[i];
    const ctx: InterpolationContext = {
      ...options.interpolation,
      stepResults,
    };
    const resolvedReq = interpolateRequest(rawReq, ctx);
    const execution = await executeHttpRequest(resolvedReq, {
      ...options.executeOptions,
      interpolation: undefined,
    });

    // Store by both id and name so `{{login.response.body.$.token}}` works seamlessly
    stepResults[rawReq.id] = execution;
    if (rawReq.name && rawReq.name !== rawReq.id) {
      stepResults[rawReq.name] = execution;
    }

    const assertionResults = rawReq.assertions.map((rule) =>
      evaluateAssertion(rule, execution)
    );

    const stepPassed =
      !execution.error && assertionResults.every((a) => a.passed);

    totalAssertions += assertionResults.length;
    const stepPassCount = assertionResults.filter((a) => a.passed).length;
    passedAssertions += stepPassCount;
    failedAssertions += assertionResults.length - stepPassCount;

    if (stepPassed) {
      passedSteps++;
    } else {
      failedSteps++;
    }

    const stepResult: ChainStepResult = {
      requestId: rawReq.id,
      requestName: rawReq.name,
      method: resolvedReq.method,
      resolvedUrl: resolvedReq.url,
      execution,
      assertions: assertionResults,
      passed: stepPassed,
    };

    steps.push(stepResult);
    options.onStepComplete?.(stepResult, i, requests.length);

    if (!stepPassed && options.stopOnFailure) {
      break;
    }
  }

  const totalDurationMs = Math.round((performance.now() - startPerf) * 100) / 100;

  return {
    collectionName: options.collectionName || 'CaliberHTTP Chain',
    startedAtIso,
    finishedAtIso: new Date().toISOString(),
    totalDurationMs,
    totalSteps: steps.length,
    passedSteps,
    failedSteps,
    totalAssertions,
    passedAssertions,
    failedAssertions,
    passed: failedSteps === 0,
    steps,
  };
}

export function exportChainReportJson(report: ChainRunReport): string {
  return JSON.stringify(report, null, 2);
}

export function exportChainReportMarkdown(report: ChainRunReport): string {
  const lines: string[] = [
    `# CaliberHTTP Chain Report — ${report.collectionName}`,
    '',
    `- **Status:** ${report.passed ? 'PASSED' : 'FAILED'}`,
    `- **Steps:** ${report.passedSteps}/${report.totalSteps} passed`,
    `- **Assertions:** ${report.passedAssertions}/${report.totalAssertions} passed`,
    `- **Total Duration:** ${report.totalDurationMs} ms`,
    `- **Timestamp:** ${report.finishedAtIso}`,
    '',
    '| # | Step | Method | Status | Latency | Assertions | Result |',
    '|---:|---|---|---:|---:|---:|---|',
  ];

  report.steps.forEach((s, idx) => {
    const passCount = s.assertions.filter((a) => a.passed).length;
    const statusLabel = s.execution.error
      ? `ERR (${s.execution.error})`
      : `${s.execution.status} ${s.execution.statusText}`;
    lines.push(
      `| ${idx + 1} | ${s.requestName} | \`${s.method}\` | ${statusLabel} | ${s.execution.durationMs} ms | ${passCount}/${s.assertions.length} | ${s.passed ? 'PASS' : 'FAIL'} |`
    );
  });

  const failedDetails = report.steps.filter((s) => !s.passed);
  if (failedDetails.length > 0) {
    lines.push('', '## Failures');
    for (const s of failedDetails) {
      lines.push(`### ${s.requestName} (\`${s.method} ${s.resolvedUrl}\`)`);
      if (s.execution.error) {
        lines.push(`- Transport error: ${s.execution.error}`);
      }
      for (const a of s.assertions.filter((x) => !x.passed)) {
        lines.push(`- ${a.message}`);
      }
    }
  }

  return lines.join('\n') + '\n';
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export function exportChainReportJUnit(report: ChainRunReport): string {
  const suiteTimeSec = (report.totalDurationMs / 1000).toFixed(3);
  const lines: string[] = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<testsuites name="${escapeXml(report.collectionName)}" tests="${report.totalSteps}" failures="${report.failedSteps}" time="${suiteTimeSec}">`,
    `  <testsuite name="${escapeXml(report.collectionName)}" tests="${report.totalSteps}" failures="${report.failedSteps}" time="${suiteTimeSec}" timestamp="${escapeXml(report.startedAtIso)}">`,
  ];

  for (const step of report.steps) {
    const timeSec = (step.execution.durationMs / 1000).toFixed(3);
    const nameAttr = escapeXml(`${step.method} ${step.requestName}`);
    if (step.passed) {
      lines.push(
        `    <testcase classname="${escapeXml(report.collectionName)}" name="${nameAttr}" time="${timeSec}" />`
      );
    } else {
      const reasons: string[] = [];
      if (step.execution.error) {
        reasons.push(`Transport Error: ${step.execution.error}`);
      }
      for (const a of step.assertions.filter((x) => !x.passed)) {
        reasons.push(a.message);
      }
      const msg = reasons.join('; ') || 'Step failed';
      lines.push(
        `    <testcase classname="${escapeXml(report.collectionName)}" name="${nameAttr}" time="${timeSec}">`
      );
      lines.push(
        `      <failure message="${escapeXml(msg)}">${escapeXml(reasons.join('\n'))}</failure>`
      );
      lines.push('    </testcase>');
    }
  }

  lines.push('  </testsuite>', '</testsuites>');
  return lines.join('\n') + '\n';
}
