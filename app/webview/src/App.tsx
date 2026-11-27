import React, { useEffect, useState } from 'react';
import { ResponseViewer } from './components/ResponseViewer';
import type {
  AssertionRule,
  HttpHeader,
  HttpMethod,
  HttpRequestBlock,
  StudioStateSnapshot,
} from './types';
import { postToExtension } from './vscodeApi';

const METHODS: HttpMethod[] = [
  'GET',
  'POST',
  'PUT',
  'PATCH',
  'DELETE',
  'HEAD',
  'OPTIONS',
];

type ReqTab = 'params' | 'headers' | 'auth' | 'body' | 'assertions' | 'vault';

function extractQueryParams(url: string): Array<{ key: string; value: string }> {
  const qIdx = url.indexOf('?');
  if (qIdx === -1) return [];
  const search = url.slice(qIdx + 1);
  if (!search) return [];
  return search.split('&').map((pair) => {
    const eq = pair.indexOf('=');
    if (eq === -1) return { key: decodeURIComponent(pair), value: '' };
    return {
      key: decodeURIComponent(pair.slice(0, eq)),
      value: decodeURIComponent(pair.slice(eq + 1)),
    };
  });
}

function applyQueryParams(
  url: string,
  params: Array<{ key: string; value: string }>
): string {
  const qIdx = url.indexOf('?');
  const base = qIdx === -1 ? url : url.slice(0, qIdx);
  const active = params.filter((p) => p.key.trim().length > 0);
  if (active.length === 0) return base;
  const query = active
    .map((p) => `${encodeURIComponent(p.key)}=${encodeURIComponent(p.value)}`)
    .join('&');
  return `${base}?${query}`;
}

export const App: React.FC = () => {
  const [state, setState] = useState<StudioStateSnapshot | null>(null);
  const [draft, setDraft] = useState<HttpRequestBlock | null>(null);
  const [reqTab, setReqTab] = useState<ReqTab>('headers');
  const [loading, setLoading] = useState(false);
  const [loadingLabel, setLoadingLabel] = useState<string | undefined>();
  const [toast, setToast] = useState<{ level: string; message: string } | null>(
    null
  );
  const [vaultPass, setVaultPass] = useState('');
  const [newSecretKey, setNewSecretKey] = useState('');
  const [newSecretVal, setNewSecretVal] = useState('');
  const [authMode, setAuthMode] = useState<'none' | 'bearer' | 'basic' | 'apikey'>('none');
  const [authToken, setAuthToken] = useState('');
  const [authUser, setAuthUser] = useState('');
  const [authPass, setAuthPass] = useState('');
  const [apiKeyHeader, setApiKeyHeader] = useState('X-API-Key');

  useEffect(() => {
    const handler = (event: MessageEvent) => {
      const msg = event.data;
      if (!msg || typeof msg !== 'object') return;
      if (msg.type === 'state') {
        const payload = msg.payload as StudioStateSnapshot;
        setState(payload);
        if (payload.activeRequest) {
          setDraft(payload.activeRequest);
        }
      } else if (msg.type === 'loading') {
        setLoading(Boolean(msg.loading));
        setLoadingLabel(msg.label);
      } else if (msg.type === 'toast') {
        setToast({ level: msg.level, message: msg.message });
        setTimeout(() => setToast(null), 4000);
      }
    };
    window.addEventListener('message', handler);
    postToExtension({ type: 'ready' });
    return () => window.removeEventListener('message', handler);
  }, []);

  // Keyboard shortcut: Cmd/Ctrl + Enter to send active request
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter' && draft) {
        e.preventDefault();
        postToExtension({ type: 'sendRequest', request: draft });
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [draft]);

  if (!state) {
    return (
      <div className="studio-shell">
        <div className="onboarding">
          <h2>CaliberHTTP Studio</h2>
          <p>Loading workspace...</p>
        </div>
      </div>
    );
  }

  const updateDraft = (patch: Partial<HttpRequestBlock>) => {
    if (!draft) return;
    setDraft({ ...draft, ...patch });
  };

  const applyAuthHeader = (nextHeaders: HttpHeader[], key: string, value: string) => {
    const filtered = nextHeaders.filter(
      (h) => h.key.toLowerCase() !== key.toLowerCase()
    );
    if (value) {
      filtered.push({ key, value, enabled: true });
    }
    updateDraft({ headers: filtered });
  };

  const params = draft ? extractQueryParams(draft.url) : [];

  return (
    <div className="studio-shell">
      <div className="topbar">
        <div className="topbar-group">
          <span className="brand">
            CaliberHTTP
            <span
              className={`pill ${state.license.tier === 'pro' ? 'pill-pro' : ''}`}
            >
              {state.license.tier === 'pro'
                ? state.license.offlineGraceActive
                  ? 'PRO (OFFLINE)'
                  : 'PRO'
                : 'FREE'}
            </span>
          </span>

          {state.fileRequests.length > 0 && (
            <select
              className="select"
              aria-label="Select request"
              value={draft?.id || ''}
              onChange={(e) =>
                postToExtension({ type: 'selectRequest', requestId: e.target.value })
              }
            >
              {state.fileRequests.map((r) => (
                <option key={r.id} value={r.id}>
                  [{r.method}] {r.name}
                </option>
              ))}
            </select>
          )}

          <select
            className="select"
            aria-label="Select environment"
            value={state.activeEnvironment}
            onChange={(e) =>
              postToExtension({
                type: 'selectEnvironment',
                envName: e.target.value,
              })
            }
          >
            <option value="">No Env</option>
            {state.environments.map((env) => (
              <option key={env} value={env}>
                env: {env}
              </option>
            ))}
          </select>
        </div>

        <div className="topbar-group">
          <button
            className="btn btn-sm"
            onClick={() => postToExtension({ type: 'importCurl' })}
          >
            Import cURL
          </button>
          <button
            className="btn btn-sm"
            onClick={() => postToExtension({ type: 'importHar' })}
          >
            Import HAR
          </button>
          <button
            className="btn btn-sm"
            onClick={() => postToExtension({ type: 'toggleMockServer' })}
          >
            {state.mockServer.running
              ? `Mock: ON (${state.mockServer.url})`
              : 'Mock Server'}
          </button>
          {state.license.tier === 'free' ? (
            <button
              className="btn btn-primary btn-sm"
              onClick={() => postToExtension({ type: 'activateLicense' })}
            >
              Activate Pro
            </button>
          ) : (
            <button
              className="btn btn-sm"
              onClick={() => postToExtension({ type: 'deactivateLicense' })}
            >
              {state.license.keyMask || 'Pro Active'}
            </button>
          )}
        </div>
      </div>

      {!draft ? (
        <div className="onboarding">
          <h2>Git-Native .http Studio for VS Code</h2>
          <p>
            Zero login. Zero cloud lock-in. Plain-text <code>.http</code> files
            with two-way visual editing, local environments, GraphQL, and
            automated testing.
          </p>
          <div className="onboarding-actions">
            <button
              className="btn btn-primary"
              onClick={() =>
                postToExtension({ type: 'createStarterCollection' })
              }
            >
              Create Starter Collection (api.http)
            </button>
            <button
              className="btn"
              onClick={() => postToExtension({ type: 'importCurl' })}
            >
              Import cURL
            </button>
            <button
              className="btn"
              onClick={() => postToExtension({ type: 'importHar' })}
            >
              Import HAR (Pro)
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="request-bar">
            <select
              className="select"
              aria-label="HTTP Method"
              value={draft.method}
              onChange={(e) =>
                updateDraft({ method: e.target.value as HttpMethod })
              }
            >
              {METHODS.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>

            <input
              className="input url-input"
              value={draft.url}
              placeholder="https://api.example.com/v1/resource"
              onChange={(e) => updateDraft({ url: e.target.value })}
            />

            <button
              className="btn btn-primary"
              disabled={loading}
              onClick={() =>
                postToExtension({ type: 'sendRequest', request: draft })
              }
            >
              {loading ? 'Sending...' : 'Send'}
            </button>
            <button
              className="btn"
              onClick={() =>
                postToExtension({ type: 'saveRequest', request: draft })
              }
              title="Sync edits back to .http file"
            >
              Save .http
            </button>
            <button
              className="btn"
              onClick={() =>
                postToExtension({ type: 'exportCurl', request: draft })
              }
            >
              cURL
            </button>
          </div>

          <div className="split-pane">
            <div className="pane pane-left">
              <div className="tabs">
                <button
                  className={`tab ${reqTab === 'params' ? 'active' : ''}`}
                  onClick={() => setReqTab('params')}
                >
                  Params ({params.length})
                </button>
                <button
                  className={`tab ${reqTab === 'headers' ? 'active' : ''}`}
                  onClick={() => setReqTab('headers')}
                >
                  Headers ({draft.headers.length})
                </button>
                <button
                  className={`tab ${reqTab === 'auth' ? 'active' : ''}`}
                  onClick={() => setReqTab('auth')}
                >
                  Auth
                </button>
                <button
                  className={`tab ${reqTab === 'body' ? 'active' : ''}`}
                  onClick={() => setReqTab('body')}
                >
                  Body
                </button>
                <button
                  className={`tab ${reqTab === 'assertions' ? 'active' : ''}`}
                  onClick={() => setReqTab('assertions')}
                >
                  Assertions ({draft.assertions.length})
                </button>
                <button
                  className={`tab ${reqTab === 'vault' ? 'active' : ''}`}
                  onClick={() => setReqTab('vault')}
                >
                  Vault (Pro)
                </button>
              </div>

              <div className="pane-body">
                {reqTab === 'params' && (
                  <div>
                    {params.map((p, idx) => (
                      <div className="kv-row" key={idx}>
                        <span className="muted">{idx + 1}</span>
                        <input
                          className="input"
                          placeholder="Param"
                          value={p.key}
                          onChange={(e) => {
                            const next = [...params];
                            next[idx] = { ...p, key: e.target.value };
                            updateDraft({
                              url: applyQueryParams(draft.url, next),
                            });
                          }}
                        />
                        <input
                          className="input"
                          placeholder="Value"
                          value={p.value}
                          onChange={(e) => {
                            const next = [...params];
                            next[idx] = { ...p, value: e.target.value };
                            updateDraft({
                              url: applyQueryParams(draft.url, next),
                            });
                          }}
                        />
                        <button
                          className="btn btn-sm"
                          onClick={() => {
                            const next = params.filter((_, i) => i !== idx);
                            updateDraft({
                              url: applyQueryParams(draft.url, next),
                            });
                          }}
                        >
                          ×
                        </button>
                      </div>
                    ))}
                    <button
                      className="btn btn-sm"
                      onClick={() =>
                        updateDraft({
                          url: applyQueryParams(draft.url, [
                            ...params,
                            { key: 'param', value: '' },
                          ]),
                        })
                      }
                    >
                      + Add Query Param
                    </button>
                  </div>
                )}

                {reqTab === 'headers' && (
                  <div>
                    {draft.headers.map((h, idx) => (
                      <div className="kv-row" key={idx}>
                        <input
                          type="checkbox"
                          checked={h.enabled}
                          onChange={(e) => {
                            const next = [...draft.headers];
                            next[idx] = { ...h, enabled: e.target.checked };
                            updateDraft({ headers: next });
                          }}
                        />
                        <input
                          className="input"
                          placeholder="Header Name"
                          value={h.key}
                          onChange={(e) => {
                            const next = [...draft.headers];
                            next[idx] = { ...h, key: e.target.value };
                            updateDraft({ headers: next });
                          }}
                        />
                        <input
                          className="input"
                          placeholder="Header Value"
                          value={h.value}
                          onChange={(e) => {
                            const next = [...draft.headers];
                            next[idx] = { ...h, value: e.target.value };
                            updateDraft({ headers: next });
                          }}
                        />
                        <button
                          className="btn btn-sm"
                          onClick={() =>
                            updateDraft({
                              headers: draft.headers.filter((_, i) => i !== idx),
                            })
                          }
                        >
                          ×
                        </button>
                      </div>
                    ))}
                    <button
                      className="btn btn-sm"
                      onClick={() =>
                        updateDraft({
                          headers: [
                            ...draft.headers,
                            { key: '', value: '', enabled: true },
                          ],
                        })
                      }
                    >
                      + Add Header
                    </button>
                  </div>
                )}

                {reqTab === 'auth' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <select
                      className="select"
                      value={authMode}
                      onChange={(e) =>
                        setAuthMode(
                          e.target.value as 'none' | 'bearer' | 'basic' | 'apikey'
                        )
                      }
                    >
                      <option value="none">No Auth Helper</option>
                      <option value="bearer">Bearer Token</option>
                      <option value="basic">Basic Auth</option>
                      <option value="apikey">API Key Header</option>
                    </select>

                    {authMode === 'bearer' && (
                      <>
                        <input
                          className="input"
                          placeholder="Token or {{vault.API_TOKEN}}"
                          value={authToken}
                          onChange={(e) => setAuthToken(e.target.value)}
                        />
                        <button
                          className="btn btn-primary btn-sm"
                          onClick={() =>
                            applyAuthHeader(
                              draft.headers,
                              'Authorization',
                              `Bearer ${authToken}`
                            )
                          }
                        >
                          Apply Bearer Header
                        </button>
                      </>
                    )}

                    {authMode === 'basic' && (
                      <>
                        <input
                          className="input"
                          placeholder="Username"
                          value={authUser}
                          onChange={(e) => setAuthUser(e.target.value)}
                        />
                        <input
                          className="input"
                          type="password"
                          placeholder="Password"
                          value={authPass}
                          onChange={(e) => setAuthPass(e.target.value)}
                        />
                        <button
                          className="btn btn-primary btn-sm"
                          onClick={() =>
                            applyAuthHeader(
                              draft.headers,
                              'Authorization',
                              `Basic ${btoa(`${authUser}:${authPass}`)}`
                            )
                          }
                        >
                          Apply Basic Header
                        </button>
                      </>
                    )}

                    {authMode === 'apikey' && (
                      <>
                        <input
                          className="input"
                          placeholder="Header Name (e.g. X-API-Key)"
                          value={apiKeyHeader}
                          onChange={(e) => setApiKeyHeader(e.target.value)}
                        />
                        <input
                          className="input"
                          placeholder="API Key Value"
                          value={authToken}
                          onChange={(e) => setAuthToken(e.target.value)}
                        />
                        <button
                          className="btn btn-primary btn-sm"
                          onClick={() =>
                            applyAuthHeader(
                              draft.headers,
                              apiKeyHeader || 'X-API-Key',
                              authToken
                            )
                          }
                        >
                          Apply API Key Header
                        </button>
                      </>
                    )}
                  </div>
                )}

                {reqTab === 'body' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <label className="muted">Request Body (JSON / Text / GraphQL Query)</label>
                    <textarea
                      className="textarea"
                      value={draft.body ?? ''}
                      placeholder='{"hello": "world"}'
                      onChange={(e) => updateDraft({ body: e.target.value })}
                    />
                    <label className="muted">
                      GraphQL Variables (Optional JSON — auto-wraps as GraphQL-over-HTTP)
                    </label>
                    <textarea
                      className="textarea"
                      style={{ minHeight: 80 }}
                      value={draft.graphqlVariables ?? ''}
                      placeholder='{"id": 1}'
                      onChange={(e) =>
                        updateDraft({
                          graphqlVariables: e.target.value || undefined,
                        })
                      }
                    />
                  </div>
                )}

                {reqTab === 'assertions' && (
                  <div>
                    <p className="muted" style={{ marginTop: 0 }}>
                      Saved as <code># @assert</code> lines in your <code>.http</code> file and evaluated in Chain Runner (Pro).
                    </p>
                    {draft.assertions.map((a, idx) => (
                      <div className="kv-row" key={idx}>
                        <span className="muted">{idx + 1}</span>
                        <input
                          className="input"
                          value={a.target}
                          placeholder="status | latency | body.$.id"
                          onChange={(e) => {
                            const next = [...draft.assertions];
                            next[idx] = {
                              ...a,
                              target: e.target.value as AssertionRule['target'],
                            };
                            updateDraft({ assertions: next });
                          }}
                        />
                        <input
                          className="input"
                          value={`${a.operator} ${a.expected ?? ''}`.trim()}
                          placeholder="== 200"
                          onChange={(e) => {
                            const parts = e.target.value.trim().split(/\s+/);
                            const op = (parts[0] || '==') as AssertionRule['operator'];
                            const exp = parts.slice(1).join(' ');
                            const next = [...draft.assertions];
                            next[idx] = { ...a, operator: op, expected: exp };
                            updateDraft({ assertions: next });
                          }}
                        />
                        <button
                          className="btn btn-sm"
                          onClick={() =>
                            updateDraft({
                              assertions: draft.assertions.filter((_, i) => i !== idx),
                            })
                          }
                        >
                          ×
                        </button>
                      </div>
                    ))}
                    <button
                      className="btn btn-sm"
                      onClick={() =>
                        updateDraft({
                          assertions: [
                            ...draft.assertions,
                            { target: 'status', operator: '==', expected: 200 },
                          ],
                        })
                      }
                    >
                      + Add Assertion
                    </button>
                  </div>
                )}

                {reqTab === 'vault' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <p className="muted" style={{ margin: 0 }}>
                      AES-256-GCM encrypted <code>.caliber/vault.enc</code> (Git-safe, zero cloud sync). Reference keys as <code>{'{{vault.MY_KEY}}'}</code>.
                    </p>
                    {!state.vault.unlocked ? (
                      <div className="topbar-group">
                        <input
                          className="input"
                          type="password"
                          placeholder="Vault passphrase"
                          value={vaultPass}
                          onChange={(e) => setVaultPass(e.target.value)}
                        />
                        <button
                          className="btn btn-primary btn-sm"
                          onClick={() => {
                            postToExtension({
                              type: 'unlockVault',
                              passphrase: vaultPass,
                            });
                            setVaultPass('');
                          }}
                        >
                          {state.vault.exists ? 'Unlock Vault' : 'Initialize Vault'}
                        </button>
                      </div>
                    ) : (
                      <>
                        <div className="topbar-group">
                          <input
                            className="input"
                            placeholder="KEY_NAME"
                            value={newSecretKey}
                            onChange={(e) => setNewSecretKey(e.target.value)}
                          />
                          <input
                            className="input"
                            type="password"
                            placeholder="Secret value"
                            value={newSecretVal}
                            onChange={(e) => setNewSecretVal(e.target.value)}
                          />
                          <button
                            className="btn btn-primary btn-sm"
                            onClick={() => {
                              postToExtension({
                                type: 'setVaultSecret',
                                key: newSecretKey,
                                value: newSecretVal,
                              });
                              setNewSecretKey('');
                              setNewSecretVal('');
                            }}
                          >
                            Save Secret
                          </button>
                          <button
                            className="btn btn-sm"
                            onClick={() => postToExtension({ type: 'lockVault' })}
                          >
                            Lock
                          </button>
                        </div>
                        <table className="table">
                          <thead>
                            <tr>
                              <th>Secret Key</th>
                              <th>Reference</th>
                              <th></th>
                            </tr>
                          </thead>
                          <tbody>
                            {state.vault.keys.map((k) => (
                              <tr key={k}>
                                <td>
                                  <code>{k}</code>
                                </td>
                                <td className="muted">{`{{vault.${k}}}`}</td>
                                <td>
                                  <button
                                    className="btn btn-sm"
                                    onClick={() =>
                                      postToExtension({
                                        type: 'deleteVaultSecret',
                                        key: k,
                                      })
                                    }
                                  >
                                    Delete
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </>
                    )}
                  </div>
                )}
              </div>
            </div>

            <ResponseViewer
              state={state}
              loading={loading}
              loadingLabel={loadingLabel}
            />
          </div>
        </>
      )}

      {toast && <div className="toast">{toast.message}</div>}
    </div>
  );
};
