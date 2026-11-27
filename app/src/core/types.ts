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

export type AssertionOperator =
  | '=='
  | '!='
  | '<'
  | '<='
  | '>'
  | '>='
  | 'contains'
  | 'exists';

export type AssertionTarget =
  | 'status'
  | 'latency'
  | `header.${string}`
  | `body.${string}`;

export interface AssertionRule {
  target: AssertionTarget;
  operator: AssertionOperator;
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

export interface HttpDocument {
  filePath?: string;
  variables: Record<string, string>;
  requests: HttpRequestBlock[];
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

export type SchemaNodeType =
  | 'string'
  | 'number'
  | 'integer'
  | 'boolean'
  | 'null'
  | 'array'
  | 'object'
  | 'unknown';

export interface SchemaNode {
  type: SchemaNodeType;
  properties?: Record<string, SchemaNode>;
  items?: SchemaNode;
}

export interface ResponseSnapshot {
  requestId: string;
  capturedAtIso: string;
  status: number;
  contentType?: string;
  schema: SchemaNode;
  sampleBody?: unknown;
}

export interface DriftFinding {
  path: string;
  severity: 'breaking' | 'warning' | 'info';
  kind: 'removed_field' | 'type_changed' | 'added_field' | 'status_changed';
  expected: string;
  actual: string;
}

export interface MockRoute {
  method: HttpMethod | '*';
  pathPattern: string;
  status: number;
  headers: Record<string, string>;
  body: string;
  source?: string;
}

export interface MockRequestLog {
  timestampIso: string;
  method: string;
  path: string;
  status: number;
  matchedPattern?: string;
}

export interface EnvConfig {
  $shared?: Record<string, string>;
  [envName: string]: Record<string, string> | undefined;
}
