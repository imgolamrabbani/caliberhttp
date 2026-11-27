(function () {
  const root = document.documentElement;
  const saved = localStorage.getItem('caliber_theme');
  if (saved === 'light' || saved === 'dark') {
    root.setAttribute('data-theme', saved);
  }

  const toggleBtn = document.getElementById('theme-toggle');
  function syncLabel() {
    if (!toggleBtn) return;
    const current = root.getAttribute('data-theme') || 'dark';
    toggleBtn.textContent = current === 'light' ? 'Dark Mode' : 'Light Mode';
  }
  syncLabel();

  if (toggleBtn) {
    toggleBtn.addEventListener('click', function () {
      const next = root.getAttribute('data-theme') === 'light' ? 'dark' : 'light';
      root.setAttribute('data-theme', next);
      localStorage.setItem('caliber_theme', next);
      syncLabel();
    });
  }

  const snippets = {
    chain: {
      code: `### Authenticate & Capture Token
@name login
POST {{baseUrl}}/v1/auth/login
Content-Type: application/json
X-Request-Id: {{$uuid}}

{ "email": "{{userEmail}}", "role": "admin" }

@assert status == 200
@assert body.$.token exists

### Fetch Profile (Chained)
GET {{baseUrl}}/v1/me
Authorization: Bearer {{login.response.body.$.token}}`,
      status: '200 OK · 24 ms · 2/2 Assertions Passed'
    },
    graphql: {
      code: `### GraphQL-over-HTTP Query
POST {{baseUrl}}/graphql
Content-Type: application/json
X-Request-Type: GraphQL

query GetProject($id: ID!) {
  project(id: $id) { id name environment }
}

{ "id": "proj_01J9" }`,
      status: '200 OK · 31 ms · GraphQL Variables Synced'
    },
    drift: {
      code: `### Schema Drift Check (Baseline Pinned)
GET {{baseUrl}}/v1/users/42
Accept: application/json

@assert status == 200
@assert body.$.data.user.id exists

# Drift Report:
# [BREAKING] $.data.user.id: number -> string
# [ADDED]    $.data.user.mfaEnabled: boolean`,
      status: 'Drift Detected · 1 Breaking · 1 Added'
    }
  };

  const tabs = document.querySelectorAll('[data-snippet]');
  const codeEl = document.getElementById('preview-code');
  const statusEl = document.getElementById('preview-status');

  tabs.forEach(function (tab) {
    tab.addEventListener('click', function () {
      tabs.forEach(function (t) { t.classList.remove('active'); });
      tab.classList.add('active');
      const key = tab.getAttribute('data-snippet');
      const item = snippets[key];
      if (item && codeEl && statusEl) {
        codeEl.textContent = item.code;
        statusEl.textContent = item.status;
      }
    });
  });
})();
