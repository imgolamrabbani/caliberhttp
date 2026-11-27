import React, { useState } from 'react';
import type { StudioStateSnapshot } from '../types';
import { postToExtension } from '../vscodeApi';

interface Props {
  state: StudioStateSnapshot;
  loading: boolean;
  loadingLabel?: string;
}

type RespTab = 'pretty' | 'raw' | 'headers' | 'chain' | 'drift' | 'mock' | 'history';

export const ResponseViewer: React.FC<Props> = ({
  state,
  loading,
  loadingLabel,
}) => {
  const [tab, setTab] = useState<RespTab>('pretty');
  const res = state.lastResult;

  const formattedBody = (() => {
    if (!res) return '';
    if (res.bodyJson !== undefined) {
      return JSON.stringify(res.bodyJson, null, 2);
    }
    return res.bodyText;
  })();

  const statusClass =
    res && !res.error && res.status >= 200 && res.status < 400
      ? 'status-ok'
      : 'status-err';

  return (
    <div className="pane">
      <div className="response-meta">
        <div className="topbar-group">
          {loading ? (
            <span className="muted">{loadingLabel || 'Running request...'}</span>
          ) : res ? (
            <>
              <span className={statusClass}>
                {res.error ? `ERROR` : `${res.status} ${res.statusText}`}
              </span>
              <span className="muted">{res.durationMs} ms</span>
              <span className="muted">{res.sizeBytes} B</span>
            </>
          ) : (
            <span className="muted">No response yet — press Cmd/Ctrl+Enter to send</span>
          )}
        </div>
        <div className="topbar-group">
          <button
            className="btn btn-sm"
            onClick={() => postToExtension({ type: 'runChain' })}
            title="Run all requests in file sequentially (Pro)"
          >
            Run Chain
          </button>
          {state.activeRequest && res && (
            <>
              <button
                className="btn btn-sm"
                onClick={() =>
                  postToExtension({
                    type: 'captureSnapshot',
                    requestId: state.activeRequest!.id,
                  })
                }
              >
                Pin Baseline
              </button>
              <button
                className="btn btn-sm"
                onClick={() => {
                  setTab('drift');
                  postToExtension({
                    type: 'diffDrift',
                    requestId: state.activeRequest!.id,
                  });
                }}
              >
                Diff Drift
              </button>
            </>
          )}
        </div>
      </div>

      <div className="tabs">
        <button
          className={`tab ${tab === 'pretty' ? 'active' : ''}`}
          onClick={() => setTab('pretty')}
        >
          Pretty
        </button>
        <button
          className={`tab ${tab === 'raw' ? 'active' : ''}`}
          onClick={() => setTab('raw')}
        >
          Raw
        </button>
        <button
          className={`tab ${tab === 'headers' ? 'active' : ''}`}
          onClick={() => setTab('headers')}
        >
          Headers ({res ? Object.keys(res.headers).length : 0})
        </button>
        <button
          className={`tab ${tab === 'chain' ? 'active' : ''}`}
          onClick={() => setTab('chain')}
        >
          Chain Report
        </button>
        <button
          className={`tab ${tab === 'drift' ? 'active' : ''}`}
          onClick={() => setTab('drift')}
        >
          Schema Drift
        </button>
        <button
          className={`tab ${tab === 'mock' ? 'active' : ''}`}
          onClick={() => setTab('mock')}
        >
          Mock Server
        </button>
        <button
          className={`tab ${tab === 'history' ? 'active' : ''}`}
          onClick={() => setTab('history')}
        >
          History ({state.history.length})
        </button>
      </div>

      <div className="pane-body">
        {tab === 'pretty' && (
          <>
            {res?.error ? (
              <pre className="code-block status-err">{res.error}</pre>
            ) : res ? (
              <pre className="code-block">{formattedBody || '(empty response body)'}</pre>
            ) : (
              <p className="muted">Response body will appear here.</p>
            )}
          </>
        )}

        {tab === 'raw' && (
          <pre className="code-block">{res?.bodyText || '(empty)'}</pre>
        )}

        {tab === 'headers' && (
          <table className="table">
            <thead>
              <tr>
                <th>Header</th>
                <th>Value</th>
              </tr>
            </thead>
            <tbody>
              {res &&
                Object.entries(res.headers).map(([k, v]) => (
                  <tr key={k}>
                    <td>
                      <code>{k}</code>
                    </td>
                    <td>{v}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        )}

        {tab === 'chain' && (
          <div>
            {state.chainReport ? (
              <>
                <div className="topbar-group" style={{ marginBottom: 10 }}>
                  <strong
                    className={
                      state.chainReport.passed ? 'status-ok' : 'status-err'
                    }
                  >
                    {state.chainReport.passed ? 'CHAIN PASSED' : 'CHAIN FAILED'}
                  </strong>
                  <span className="muted">
                    {state.chainReport.passedSteps}/{state.chainReport.totalSteps} steps ·{' '}
                    {state.chainReport.passedAssertions}/{state.chainReport.totalAssertions} assertions ·{' '}
                    {state.chainReport.totalDurationMs} ms
                  </span>
                  <button
                    className="btn btn-sm"
                    onClick={() =>
                      postToExtension({ type: 'exportChainReport', format: 'junit' })
                    }
                  >
                    Export JUnit XML
                  </button>
                  <button
                    className="btn btn-sm"
                    onClick={() =>
                      postToExtension({
                        type: 'exportChainReport',
                        format: 'markdown',
                      })
                    }
                  >
                    Export Markdown
                  </button>
                  <button
                    className="btn btn-sm"
                    onClick={() =>
                      postToExtension({ type: 'exportChainReport', format: 'json' })
                    }
                  >
                    Export JSON
                  </button>
                </div>
                <table className="table">
                  <thead>
                    <tr>
                      <th>Step</th>
                      <th>Status</th>
                      <th>Latency</th>
                      <th>Assertions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {state.chainReport.steps.map((s) => (
                      <tr key={s.requestId}>
                        <td>
                          <span className={`method-badge method-${s.method}`}>
                            {s.method}
                          </span>{' '}
                          {s.requestName}
                        </td>
                        <td className={s.passed ? 'status-ok' : 'status-err'}>
                          {s.execution.error || `${s.execution.status}`}
                        </td>
                        <td>{s.execution.durationMs} ms</td>
                        <td>
                          {s.assertions.map((a, idx) => (
                            <div
                              key={idx}
                              className={a.passed ? 'status-ok' : 'status-err'}
                            >
                              {a.message}
                            </div>
                          ))}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            ) : (
              <p className="muted">
                Click <strong>Run Chain</strong> to execute all requests in the active{' '}
                <code>.http</code> file sequentially with <code>@assert</code> checks.
              </p>
            )}
          </div>
        )}

        {tab === 'drift' && (
          <div>
            <p className="muted" style={{ marginTop: 0 }}>
              Baseline saved:{' '}
              <strong>{state.hasSnapshot ? 'Yes (.caliber/snapshots/)' : 'Not yet'}</strong>
            </p>
            {state.driftFindings ? (
              state.driftFindings.length === 0 ? (
                <p className="status-ok">Zero schema drift against pinned baseline.</p>
              ) : (
                <table className="table">
                  <thead>
                    <tr>
                      <th>Path</th>
                      <th>Severity</th>
                      <th>Change</th>
                      <th>Expected → Actual</th>
                    </tr>
                  </thead>
                  <tbody>
                    {state.driftFindings.map((f, idx) => (
                      <tr key={idx}>
                        <td>
                          <code>{f.path}</code>
                        </td>
                        <td
                          className={
                            f.severity === 'breaking' ? 'status-err' : 'muted'
                          }
                        >
                          {f.severity.toUpperCase()}
                        </td>
                        <td>{f.kind}</td>
                        <td>
                          {f.expected} → {f.actual}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )
            ) : (
              <p className="muted">
                Capture a baseline snapshot after sending a request, then run Diff Drift to catch breaking API changes locally.
              </p>
            )}
          </div>
        )}

        {tab === 'mock' && (
          <div>
            <div className="topbar-group" style={{ marginBottom: 10 }}>
              <button
                className="btn btn-primary btn-sm"
                onClick={() => postToExtension({ type: 'toggleMockServer' })}
              >
                {state.mockServer.running ? 'Stop Mock Server' : 'Start Local Mock Server'}
              </button>
              <span className="muted">
                {state.mockServer.running
                  ? `Listening at ${state.mockServer.url} (${state.mockServer.routeCount} routes)`
                  : 'Stopped (serves .http fixtures or OpenAPI JSON on 127.0.0.1)'}
              </span>
            </div>
            {state.mockServer.logs.length > 0 && (
              <table className="table">
                <thead>
                  <tr>
                    <th>Time</th>
                    <th>Method</th>
                    <th>Path</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {state.mockServer.logs.slice(0, 25).map((l, idx) => (
                    <tr key={idx}>
                      <td className="muted">{l.timestampIso.slice(11, 19)}</td>
                      <td>{l.method}</td>
                      <td>
                        <code>{l.path}</code>
                      </td>
                      <td>{l.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {tab === 'history' && (
          <table className="table">
            <thead>
              <tr>
                <th>Time</th>
                <th>Request</th>
                <th>Status</th>
                <th>Latency</th>
              </tr>
            </thead>
            <tbody>
              {state.history.map((h) => (
                <tr key={h.id}>
                  <td className="muted">{h.timestampIso.slice(11, 19)}</td>
                  <td>
                    <span className={`method-badge method-${h.method}`}>
                      {h.method}
                    </span>{' '}
                    {h.requestName}
                  </td>
                  <td
                    className={
                      !h.error && h.status >= 200 && h.status < 400
                        ? 'status-ok'
                        : 'status-err'
                    }
                  >
                    {h.error ? 'ERR' : h.status}
                  </td>
                  <td>{h.durationMs} ms</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};
