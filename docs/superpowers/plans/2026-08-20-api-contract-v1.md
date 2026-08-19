# API Contract v1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Standardize every authenticated frontend-to-Apps-Script call on one request/success/error contract, one shared runner, and thin domain clients while preserving current business behavior.

**Architecture:** Frontend page code calls semantic domain clients; domain clients call `runAppApi(apiName, request)`; the runner sends `{ request: ... }`; `apiHandler_()` unwraps requests, applies auth/access/parsing, executes services, wraps successful values as `{ ok: true, data }`, and rethrows client-safe errors through the Apps Script failure channel. UI loading/toast/fallback behavior remains outside the transport layer.

**Tech Stack:** Google Apps Script, HTML Service, browser JavaScript, `google.script.run`, Node.js contract/regression scripts, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-08-20-api-contract-v1-design.md`

## Global Constraints

- Every authenticated frontend request must use `{ request: ... }`.
- Every successful frontend-consumed public API must return `{ ok: true, data: ... }`.
- Errors must travel through the GAS failure channel, never as `{ ok: false }` success responses.
- Shared frontend transport is `runAppApi(apiName, request) -> Promise<data>`.
- Loading, toast, retry, fallback, modal, and navigation logic remain outside `runAppApi()`.
- Page UI code must call semantic domain clients rather than domain-specific GAS wrappers.
- Direct `google.script.run` API calls are forbidden outside the approved shared runner and explicitly approved platform integration code.
- Existing business workflows, DB schemas, permissions, and unfinished features must not be redesigned or activated.
- Server request unwrapping must accept both canonical `{ request }` envelopes and legacy raw request objects during migration.
- All existing Node regression workflows must remain green before integration.

---

### Task 1: Lock the server-side request/success/error contract

**Files:**
- Create: `src/000_server/010_core/api_request.gs`
- Modify: `src/000_server/010_core/api_handler.gs`
- Modify: `src/000_server/010_core/response.gs`
- Test: `scripts/test-api-contract-v1-server.js`

**Interfaces:**
- Consumes: existing `apiHandler_(options)`, `okResponse_`, auth/access helpers, existing domain parsers/services.
- Produces:
  - `unwrapApiRequest_(input) -> object`
  - `wrapApiSuccess_(data) -> { ok: true, data: any }`
  - `normalizeApiException_(error) -> Error`
  - updated `apiHandler_(options)` that unwraps input, invokes parser/service, wraps success exactly once, and rethrows normalized errors.

- [ ] **Step 1: Write the failing server contract test**

Create `scripts/test-api-contract-v1-server.js` using `vm` to load `api_request.gs`, `response.gs`, and `api_handler.gs` with stubbed auth/access helpers.

The test must assert:

```js
assert.deepStrictEqual(unwrapApiRequest_({ request: { id: 'A' } }), { id: 'A' });
assert.deepStrictEqual(unwrapApiRequest_({ id: 'A' }), { id: 'A' });
assert.deepStrictEqual(unwrapApiRequest_(null), {});

assert.deepStrictEqual(wrapApiSuccess_({ id: 'A' }), {
  ok: true,
  data: { id: 'A' }
});

var result = apiHandler_({
  operation: 'fixture',
  input: { request: { id: 'A' } },
  service: function (request) { return { received: request }; }
});
assert.deepStrictEqual(result, {
  ok: true,
  data: { received: { id: 'A' } }
});
```

Also assert that a thrown typed/business error is rethrown and an unexpected native error is converted to a generic client-safe error message while original error details are logged.

- [ ] **Step 2: Run the test and verify RED**

Run:

```bash
node scripts/test-api-contract-v1-server.js
```

Expected: FAIL because `unwrapApiRequest_`, `wrapApiSuccess_`, and normalized error behavior do not exist yet.

- [ ] **Step 3: Implement request unwrapping and success wrapping**

Create `src/000_server/010_core/api_request.gs`:

```js
function unwrapApiRequest_(input) {
  var source = input && typeof input === 'object' ? input : {};
  return source.request && typeof source.request === 'object'
    ? source.request
    : source;
}
```

Update `response.gs` so canonical success wrapping is explicit:

```js
function wrapApiSuccess_(data) {
  return toClientResponse_({
    ok: true,
    data: data == null ? null : data
  });
}
```

Keep legacy helpers only if existing non-migrated server code still needs them during the migration; do not use them for newly migrated frontend-consumed API paths.

- [ ] **Step 4: Update `apiHandler_()`**

Target behavior:

```js
function apiHandler_(options) {
  var operation = options && options.operation ? options.operation : 'unknown';
  var context = null;
  try {
    if (options && options.requireLogin) context = requireLoginContext_();
    if (options && options.access) resolveApiAccess_(context, options.access);
    else if (options && options.permission) requirePermission_(context, options.permission);

    var request = unwrapApiRequest_(options && options.input);
    var parsed = options && options.parse ? options.parse(request) : request;
    var data = options.service(parsed, context);
    return wrapApiSuccess_(data);
  } catch (error) {
    console.error('[' + operation + '] API execution failed.', error && error.stack ? error.stack : error);
    throw normalizeApiException_(error);
  }
}
```

Preserve the existing `access`/`permission` mutual-exclusion guard.

`normalizeApiException_()` must preserve safe typed application error metadata when available and hide stack/internal identifiers for unexpected errors.

- [ ] **Step 5: Run focused and existing server tests**

Run:

```bash
node scripts/test-api-contract-v1-server.js
node scripts/test-api-access-contract.js
node scripts/test-core.js
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/000_server/010_core/api_request.gs src/000_server/010_core/api_handler.gs src/000_server/010_core/response.gs scripts/test-api-contract-v1-server.js
git commit -m "refactor: define API contract v1 server boundary"
```

---

### Task 2: Add the shared frontend GAS runner

**Files:**
- Create: `src/100_common/app_api_runner_js.html`
- Modify: authenticated entry templates to include the runner before domain/page scripts
- Test: `scripts/test-app-api-runner.js`

**Interfaces:**
- Consumes: browser `google.script.run`.
- Produces:
  - `runAppApi(apiName, request) -> Promise<data>`
  - `normalizeAppApiError_(error) -> { code, message, details }`

- [ ] **Step 1: Write runner RED tests**

Use Node `vm` with a fake chainable `google.script.run` object. Assert:

```js
await runAppApi('api_ping', { id: 'A' });
// fake GAS receives exactly { request: { id: 'A' } }
```

No-argument case:

```js
await runAppApi('api_ping');
// receives { request: {} }
```

Success:

```js
{ ok: true, data: { value: 1 } }
```

must resolve to:

```js
{ value: 1 }
```

Malformed success such as `{ value: 1 }` must reject with `code: 'INVALID_API_RESPONSE'`.

Failure handler values must normalize to `{ code, message, details }` and reject.

- [ ] **Step 2: Run and verify RED**

```bash
node scripts/test-app-api-runner.js
```

Expected: FAIL because the shared runner file does not exist.

- [ ] **Step 3: Implement minimal shared runner**

Create `src/100_common/app_api_runner_js.html` with transport-only responsibilities:

```js
function runAppApi(apiName, request) {
  return new Promise(function (resolve, reject) {
    if (typeof google === 'undefined' || !google.script || !google.script.run) {
      reject({ code: 'GAS_UNAVAILABLE', message: 'Google Apps Script 웹앱 환경에서 실행해주세요.', details: {} });
      return;
    }

    var runner = google.script.run
      .withSuccessHandler(function (response) {
        if (!response || response.ok !== true || !Object.prototype.hasOwnProperty.call(response, 'data')) {
          reject({ code: 'INVALID_API_RESPONSE', message: '서버 응답 형식이 올바르지 않습니다.', details: {} });
          return;
        }
        resolve(response.data);
      })
      .withFailureHandler(function (error) {
        reject(normalizeAppApiError_(error));
      });

    runner[apiName]({ request: request || {} });
  });
}
```

Do not add loading, toast, retry, or fallback behavior.

- [ ] **Step 4: Include the runner in all authenticated templates**

Update the 18 authenticated entry templates so `100_common/app_api_runner_js` is included before domain/page JS that consumes it. Keep login excluded.

- [ ] **Step 5: Run runner and shell contracts**

```bash
node scripts/test-app-api-runner.js
node scripts/test-frontend-app-shell.js
node scripts/test-frontend-app-shell-behavior.js
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/100_common/app_api_runner_js.html src/250_main src/270_mypage src/300_settings src/400_accounting src/500_student_fee src/600_event scripts/test-app-api-runner.js
git commit -m "refactor: add shared frontend API runner"
```

---

### Task 3: Migrate shared shell and MyPage first

**Files:**
- Create: `src/100_common/app_client_js.html`
- Modify: `src/100_common/app_shell_js.html`
- Modify: `src/270_mypage/mypage_js.html`
- Modify: server APIs in `src/000_server/030_auth/auth_api.gs` only as needed for canonical success wrapping
- Test: `scripts/test-api-contract-v1-common-frontend.js`

**Interfaces:**
- Produces semantic common client methods:
  - `appClient.getCurrentUser()`
  - `appClient.getMyPermissions()`

- [ ] **Step 1: Write RED structural/behavior test**

Assert `app_shell_js.html` and `mypage_js.html` contain no direct `google.script.run` and no `callMyPageApi_` wrapper after migration; assert they call `appClient` methods.

- [ ] **Step 2: Run and verify RED**

```bash
node scripts/test-api-contract-v1-common-frontend.js
```

- [ ] **Step 3: Add `app_client_js.html`**

```js
var appClient = {
  getCurrentUser: function () {
    return runAppApi('api_getCurrentUser', {});
  },
  getMyPermissions: function () {
    return runAppApi('api_getMyPermissions', {});
  }
};
```

- [ ] **Step 4: Migrate App Shell**

Replace direct `google.script.run...api_getCurrentUser()` with:

```js
appClient.getCurrentUser()
  .then(function (current) {
    var access = current.domainAccess || {};
    // existing visibility logic unchanged
  })
  .catch(function () {});
```

- [ ] **Step 5: Migrate MyPage**

Remove `callMyPageApi_`. Use:

```js
var results = await Promise.all([
  appClient.getCurrentUser(),
  appClient.getMyPermissions()
]);
```

Update consumers from legacy top-level `{ ok, ...fields }` to the unwrapped `data` returned by the runner.

- [ ] **Step 6: Run common frontend and auth regressions**

```bash
node scripts/test-api-contract-v1-common-frontend.js
node scripts/test-auth-iam.js
node scripts/test-domain-access-resolvers.js
node scripts/test-frontend-app-shell-behavior.js
```

- [ ] **Step 7: Commit**

```bash
git add src/100_common/app_client_js.html src/100_common/app_shell_js.html src/270_mypage/mypage_js.html src/000_server/030_auth/auth_api.gs scripts/test-api-contract-v1-common-frontend.js
git commit -m "refactor: migrate common frontend API calls"
```

---

### Task 4: Migrate Settings to a semantic client

**Files:**
- Create: `src/300_settings/common/settings_client_js.html`
- Modify: `src/300_settings/common/settings_common_js.html`
- Modify: Settings page JS files under `src/300_settings/**`
- Modify: `src/000_server/070_settings/**/_api.gs` as required for canonical success envelopes
- Test: `scripts/test-api-contract-v1-settings.js`

**Interfaces:**
- Produces one semantic method per currently used Settings public API.
- Removes `callSettingsApi(functionName, ...args)` and `.apply(...)` transport.

- [ ] **Step 1: Inventory current Settings API calls and encode them in a failing contract test**

The test must fail if `callSettingsApi` or `.apply(google.script.run, args)` remains anywhere under `src/300_settings`.

- [ ] **Step 2: Run RED**

```bash
node scripts/test-api-contract-v1-settings.js
```

- [ ] **Step 3: Create `settingsClient`**

Example pattern:

```js
var settingsClient = {
  getUsers: function () { return runAppApi('api_getSettingsUsers', {}); },
  updateUserDepartment: function (request) { return runAppApi('api_updateSettingsUserDepartment', request); }
};
```

Add all Settings APIs actually referenced by Settings pages.

- [ ] **Step 4: Migrate Settings page consumers**

Replace `callSettingsApi(...)` usages with semantic methods. Remove response JSON-string parsing unless a verified server API still returns JSON strings; if found, normalize that server API to return plain Apps Script objects as part of this task.

- [ ] **Step 5: Run Settings and IAM regressions**

```bash
node scripts/test-api-contract-v1-settings.js
node scripts/test-department-iam.js
node scripts/test-auth-iam.js
```

- [ ] **Step 6: Commit**

```bash
git add src/300_settings src/000_server/070_settings scripts/test-api-contract-v1-settings.js
git commit -m "refactor: migrate settings API client"
```

---

### Task 5: Migrate Accounting and remove silent transport fallback

**Files:**
- Create: `src/400_accounting/common/accounting_client_js.html`
- Modify: `src/400_accounting/common/accounting_common_js.html`
- Modify: Accounting page JS files under `src/400_accounting/410_ledger`, `420_reconciliation`, `430_settlement`, and home if applicable
- Modify: frontend-consumed Accounting APIs under `src/000_server/060_accounting/**`
- Test: `scripts/test-api-contract-v1-accounting-frontend.js`

**Interfaces:**
- Removes `callServer(name, arg, fallback, options)` transport.
- Produces semantic client methods for ledger, evidence, reconciliation, and settlement frontend operations.
- Transport failures always reject.

- [ ] **Step 1: Write RED test for legacy fallback removal**

Assert no Accounting page/common JS contains:

```text
callServer(
options.strict
resolve(fallback
```

and that page code uses `accountingClient.*`.

- [ ] **Step 2: Run RED**

```bash
node scripts/test-api-contract-v1-accounting-frontend.js
```

- [ ] **Step 3: Create `accountingClient`**

Map every currently used Accounting `api_*` call to semantic methods. Examples:

```js
getEntries: function (filter) { return runAppApi('api_getLedgerEntries', filter || {}); },
getSummary: function (filter) { return runAppApi('api_getLedgerSummary', filter || {}); },
createEntry: function (request) { return runAppApi('api_createLedgerEntry', request); },
getEvidenceFileContent: function (request) { return runAppApi('api_getLedgerEvidenceFileContent', request); }
```

- [ ] **Step 4: Migrate page code**

Replace all `callServer` calls with semantic client methods. Where fallback was intentional for non-critical UI, make it explicit at the page call site with `try/catch`; do not silently treat remote failure as success.

- [ ] **Step 5: Adapt Accounting public APIs to canonical request/success behavior**

Because `apiHandler_()` now unwraps `{ request }`, public APIs should continue to pass `input` declaratively. Do not double-wrap service results that already contain domain-level `ok` fields; remove transport-level `ok` from domain service return values when it exists solely for frontend transport.

- [ ] **Step 6: Run Accounting regressions**

```bash
node scripts/test-api-contract-v1-accounting-frontend.js
node scripts/test-accounting.js
node scripts/test-accounting-boundary-contract.js
node scripts/test-accounting-money-validation.js
node scripts/test-event-accounting-payment-integration.js
```

- [ ] **Step 7: Commit**

```bash
git add src/400_accounting src/000_server/060_accounting scripts/test-api-contract-v1-accounting-frontend.js
git commit -m "refactor: migrate accounting API client"
```

---

### Task 6: Migrate Student Fee

**Files:**
- Create: `src/500_student_fee/common/student_fee_client_js.html`
- Modify: `src/500_student_fee/common/student_fee_common_js.html`
- Modify: page JS under `src/500_student_fee/**`
- Modify: frontend-consumed Student Fee APIs under `src/000_server/080_student_fee/**`
- Test: `scripts/test-api-contract-v1-student-fee.js`

**Interfaces:**
- Removes `studentFeeApi(functionName, request)`.
- Keeps Student Fee UI busy/toast helpers outside transport.

- [ ] **Step 1: Write RED test**

Assert no `studentFeeApi(` definition/calls remain after migration and all page calls use `studentFeeClient.*`.

- [ ] **Step 2: Run RED**

```bash
node scripts/test-api-contract-v1-student-fee.js
```

- [ ] **Step 3: Create `studentFeeClient`**

Map all currently used Student Fee APIs to semantic methods. Do not expose unfinished Google Form sync UI merely because `api_syncStudentFeeFormApplications` exists.

- [ ] **Step 4: Migrate pages while preserving busy/toast behavior**

Keep `studentFeeRunBusy`, `studentFeeShowToast`, modal helpers, formatting, and page-local fallback decisions unchanged except for replacing transport calls.

- [ ] **Step 5: Run Student Fee regressions and mapping contract**

```bash
node scripts/test-api-contract-v1-student-fee.js
node scripts/test-frontend-api-mapping.js
```

Also run any existing `test-student-fee-*.js` scripts discovered by the repository glob.

- [ ] **Step 6: Commit**

```bash
git add src/500_student_fee src/000_server/080_student_fee scripts/test-api-contract-v1-student-fee.js
git commit -m "refactor: migrate student fee API client"
```

---

### Task 7: Migrate Event while preserving unfinished workflows

**Files:**
- Create: `src/600_event/common/event_client_js.html`
- Modify: `src/600_event/common/event_common_js.html`
- Modify: `src/600_event/600_home/**`, `610_form/**`, `620_detail/**`
- Modify: frontend-consumed Event APIs under `src/000_server/050_event/**`
- Test: `scripts/test-api-contract-v1-event.js`

**Interfaces:**
- Removes Event `api(functionName, request)` wrapper.
- Keeps Event loading counter, toast, formatting, navigation helpers in `event_common_js.html`.
- Does not enable disabled Form sync/refund sync/payment workflows.

- [ ] **Step 1: Write RED test**

Assert Event page code no longer defines/calls generic `api(functionName, request)` and instead uses `eventClient.*`. Assert currently disabled unfinished actions remain disabled/commented and are not newly wired.

- [ ] **Step 2: Run RED**

```bash
node scripts/test-api-contract-v1-event.js
```

- [ ] **Step 3: Create `eventClient`**

Map current Event operations, including overview/list/detail/applicants/attendance/refunds/create/update/status flows. Keep request-shape knowledge in the client.

- [ ] **Step 4: Migrate Event pages**

Wrap client calls with existing `setLoading(true/false)` behavior at UI call sites or a page-level helper that does not perform transport itself.

Preserve the current incomplete `confirmDeposit` behavior; do not invent payment input fields or connect unfinished payment APIs.

- [ ] **Step 5: Run Event regressions**

```bash
node scripts/test-api-contract-v1-event.js
node scripts/test-event.js
node scripts/test-event-form-sync-frontend.js
node scripts/test-event-form-sync-api.js
node scripts/test-event-payment-contract.js
node scripts/test-event-payment-boundary.js
node scripts/test-event-accounting-payment-integration.js
```

- [ ] **Step 6: Commit**

```bash
git add src/600_event src/000_server/050_event scripts/test-api-contract-v1-event.js
git commit -m "refactor: migrate event API client"
```

---

### Task 8: Tighten the mapping verifier into an API Contract v1 gate

**Files:**
- Modify: `scripts/verify-frontend-api-mapping.js`
- Modify: `scripts/test-frontend-api-mapping.js`
- Modify: `.github/workflows/frontend-api-mapping.yml`
- Test: same files

**Interfaces:**
- Extends current existence checking to transport convention enforcement.

- [ ] **Step 1: Add failing verifier fixtures**

Add fixtures that must fail for:

```js
google.script.run.api_ping({});
callServer('api_ping', {});
studentFeeApi('api_ping', {});
api('api_ping', {});
callSettingsApi('api_ping', {});
```

outside explicitly approved runner fixtures.

Also add a passing fixture for:

```js
runAppApi('api_ping', { id: 'A' });
```

and a domain-client wrapper that calls `runAppApi`.

- [ ] **Step 2: Run verifier tests and verify RED**

```bash
node scripts/test-frontend-api-mapping.js
```

- [ ] **Step 3: Implement direct-call and legacy-wrapper detection**

The verifier must:

- allow raw `google.script.run` only in `src/100_common/app_api_runner_js.html` and explicitly whitelisted non-API platform integration files;
- fail on reintroduction of legacy wrappers;
- continue checking undefined `api_*` names;
- continue treating server APIs with no frontend reference as informational only.

- [ ] **Step 4: Ensure workflow watches all frontend/server/common paths**

Update `.github/workflows/frontend-api-mapping.yml` path filters so changes under `src/100_common`, `src/300_settings`, `src/400_accounting`, `src/500_student_fee`, `src/600_event`, `src/270_mypage`, and `src/000_server` trigger the gate.

- [ ] **Step 5: Run verifier**

```bash
node scripts/test-frontend-api-mapping.js
node scripts/verify-frontend-api-mapping.js
```

Expected: PASS, with no direct authenticated frontend GAS API calls outside the shared runner.

- [ ] **Step 6: Commit**

```bash
git add scripts/verify-frontend-api-mapping.js scripts/test-frontend-api-mapping.js .github/workflows/frontend-api-mapping.yml
git commit -m "test: enforce API contract v1 frontend transport"
```

---

### Task 9: Remove compatibility-only frontend wrappers and verify all success envelopes

**Files:**
- Delete or simplify legacy wrapper code from:
  - `src/300_settings/common/settings_common_js.html`
  - `src/400_accounting/common/accounting_common_js.html`
  - `src/500_student_fee/common/student_fee_common_js.html`
  - `src/600_event/common/event_common_js.html`
  - `src/270_mypage/mypage_js.html`
- Review all frontend-consumed `api_*` implementations under `src/000_server`
- Test: `scripts/test-api-contract-v1-public-api-shapes.js`

**Interfaces:**
- Guarantees frontend-consumed public APIs are wrapped exactly once by `apiHandler_()`.

- [ ] **Step 1: Write a static public-API shape contract**

Create a test that scans frontend-referenced public API definitions and flags common legacy success-return patterns that bypass the shared handler or manually construct transport envelopes.

At minimum, flag frontend-consumed APIs that directly return `okResponse_(...)` instead of routing through `apiHandler_()` unless explicitly whitelisted and justified.

- [ ] **Step 2: Run RED and inventory exceptions**

```bash
node scripts/test-api-contract-v1-public-api-shapes.js
```

- [ ] **Step 3: Normalize remaining frontend-consumed public APIs**

Move transport wrapping into `apiHandler_()` and leave domain service data inside `data`. Preserve genuine domain fields named `ok` only if they are business data and not transport status; rename ambiguous transport-like service results when necessary.

- [ ] **Step 4: Run full targeted contract set**

```bash
node scripts/test-api-contract-v1-server.js
node scripts/test-app-api-runner.js
node scripts/test-api-contract-v1-common-frontend.js
node scripts/test-api-contract-v1-settings.js
node scripts/test-api-contract-v1-accounting-frontend.js
node scripts/test-api-contract-v1-student-fee.js
node scripts/test-api-contract-v1-event.js
node scripts/test-api-contract-v1-public-api-shapes.js
node scripts/test-frontend-api-mapping.js
```

- [ ] **Step 5: Commit**

```bash
git add src scripts/test-api-contract-v1-public-api-shapes.js
git commit -m "refactor: finish API contract v1 migration"
```

---

### Task 10: Full repository verification and PR preparation

**Files:**
- No functional changes unless verification exposes a regression.
- Update PR description/documentation only after tests are green.

**Interfaces:**
- Produces a merge-ready branch with verified API Contract v1 behavior.

- [ ] **Step 1: Run every Node regression test**

```bash
set -euo pipefail
for test_file in scripts/test-*.js; do
  echo "::group::$test_file"
  node "$test_file"
  echo "::endgroup::"
done
```

Expected: all PASS.

- [ ] **Step 2: Run every architecture/naming verifier**

```bash
set -euo pipefail
for verify_file in scripts/verify-*.js; do
  [ -e "$verify_file" ] || continue
  echo "::group::$verify_file"
  node "$verify_file"
  echo "::endgroup::"
done
```

Expected: all PASS.

- [ ] **Step 3: Verify no forbidden transport remains**

Run repository searches:

```bash
grep -R "google\.script\.run" src/270_mypage src/300_settings src/400_accounting src/500_student_fee src/600_event src/100_common --line-number
grep -R "callServer\|studentFeeApi\|callSettingsApi\|callMyPageApi_" src --line-number
```

Expected:
- raw `google.script.run` only in `src/100_common/app_api_runner_js.html` plus explicit approved exceptions;
- no legacy frontend transport wrappers.

- [ ] **Step 4: Verify GitHub Actions on the exact branch head**

Confirm the Frontend API mapping workflow and the repository's existing full-regression workflows complete successfully on the same head SHA.

- [ ] **Step 5: Review acceptance criteria against the spec**

Confirm all 10 acceptance criteria in `docs/superpowers/specs/2026-08-20-api-contract-v1-design.md` are satisfied and that no unfinished Event payment, Student Fee Form, OCR/audit, or Settlement confirmation workflow was accidentally enabled.

- [ ] **Step 6: Prepare PR**

PR title:

```text
Standardize frontend API contract v1
```

PR body must summarize:

```text
- one shared frontend GAS runner
- canonical {request} input envelope
- canonical {ok:true,data} success envelope
- failure-channel error normalization
- semantic domain clients
- removal of legacy per-domain transport wrappers
- CI enforcement of transport convention
- no DB schema or unfinished workflow activation
```

Do not merge until the user explicitly chooses integration.
