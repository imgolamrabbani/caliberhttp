export type HttpMethod =
  | 'GET'
  | 'POST'
  | 'PUT'
  | 'PATCH'
  | 'DELETE'
  | 'HEAD'
  | 'OPTIONS';

export interface HttpHeader {
  key: string;
  value: string;
  enabled: boolean;
}

export interface AssertionRule {
  target: 'status' | 'latency' | `header.${string}` | `body.${string}`;
  operator: '==' | '!=' | '<' | '<=' | '>' | '>=' | 'contains' | 'exists';
  expected?: string | number | boolean;
  raw?: string;
}

export interface HttpRequestBlock {
  id: string;
  name: string;
  method: HttpMethod;
  url: string;
  httpVersion?: string;
  headers: HttpHeader[];
  body?: string;
  graphqlVariables?: string;
  assertions: AssertionRule[];
  lineStart: number;
  lineEnd: number;
  sourceFile?: string;
}

export interface ExecutionResult {
  requestId: string;
  requestName?: string;
  method?: HttpMethod;
  url?: string;
  status: number;
  statusText: string;
  durationMs: number;
  sizeBytes: number;
  headers: Record<string, string>;
  bodyText: string;
  bodyJson?: unknown;
  timestampIso: string;
  error?: string;
}

export interface HistoryEntry {
  id: string;
  requestId: string;
  requestName: string;
  method: HttpMethod;
  url: string;
  status: number;
  statusText: string;
  durationMs: number;
  sizeBytes: number;
  timestampIso: string;
  sourceFile?: string;
  error?: string;
}

export interface AssertionResult {
  rule: AssertionRule;
  passed: boolean;
  actual: unknown;
  message: string;
}

export interface ChainStepResult {
  requestId: string;
  requestName: string;
  method: HttpMethod;
  resolvedUrl: string;
  execution: ExecutionResult;
  assertions: AssertionResult[];
  passed: boolean;
}

export interface ChainRunReport {
  collectionName: string;
  startedAtIso: string;
  finishedAtIso: string;
  totalDurationMs: number;
  totalSteps: number;
  passedSteps: number;
  failedSteps: number;
  totalAssertions: number;
  passedAssertions: number;
  failedAssertions: number;
  passed: boolean;
  steps: ChainStepResult[];
}

export interface DriftFinding {
  path: string;
  severity: 'breaking' | 'warning' | 'info';
  kind: 'removed_field' | 'type_changed' | 'added_field' | 'status_changed';
  expected: string;
  actual: string;
}

export interface MockRequestLog {
  timestampIso: string;
  method: string;
  path: string;
  status: number;
  matchedPattern?: string;
}

export interface LicenseState {
  tier: 'free' | 'pro';
  keyMask?: string;
  activationId?: string;
  validatedAtIso?: string;
  graceUntilIso?: string;
  offlineGraceActive: boolean;
}

export interface StudioStateSnapshot {
  activeFile?: string;
  activeRequest?: HttpRequestBlock;
  fileRequests: HttpRequestBlock[];
  environments: string[];
  activeEnvironment: string;
  lastResult?: ExecutionResult;
  history: HistoryEntry[];
  chainReport?: ChainRunReport;
  driftFindings?: DriftFinding[];
  hasSnapshot: boolean;
  mockServer: {
    running: boolean;
    url: string | null;
    routeCount: number;
    logs: MockRequestLog[];
  };
  vault: {
    exists: boolean;
    unlocked: boolean;
    keys: string[];
  };
  license: LicenseState;
  checkoutUrl: string;
}
