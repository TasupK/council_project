# Project-wide Architecture Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate the current numbered Google Apps Script source tree to a physically separated `src/backend` + `src/frontend` architecture while preserving all public API contracts and user-visible behavior, then enforce the agreed backend layered architecture and FSD Lite frontend boundaries.

**Architecture:** Backend uses `Controller → Application → Business Rules → Repository → infrastructure`, with composition over inheritance and no cross-domain repository access. Frontend uses FSD Lite + Page Controller: `app → pages → widgets/features → entities → shared`. Move-only changes and responsibility-splitting changes are deliberately separated so regressions can be localized.

**Tech Stack:** Google Apps Script, HTML Service, vanilla JavaScript, Google Sheets/Drive/Form services, clasp, Node.js 20 contract tests using `assert`/`fs`/`vm`, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-08-26-project-architecture-refactor-design.md`

## Global constraints

- Preserve `src/appsscript.json` at `src/` root.
- Preserve existing public `api_*` names and response envelopes during this refactor.
- Preserve private trailing-underscore naming convention.
- Do not combine a large physical move with business-logic changes in one commit.
- Do not introduce `BaseRepository`, `BaseService`, or other inheritance-based shared abstractions.
- `backend/core` must not import or call Accounting/Event/Student Fee/IAM internals.
- Backend cross-domain calls must use a public Application facade/use case, never another domain's Repository or Controller.
- `frontend/shared` must remain business-agnostic; domain-aware code belongs to features/entities/widgets/pages.
- Do not add empty ceremonial folders/files merely to satisfy the architecture diagram.
- Every path migration updates the path-sensitive test(s) before moving production files: confirm failure, perform move, confirm pass.
- Run `git diff --check` before every task commit.

---

## Task 1: Establish architecture-aware test paths and migration guardrails

**Files:**
- Modify: `scripts/verify-frontend-api-mapping.js`
- Modify: `scripts/verify-frontend-api-contract-v1.js`
- Modify: `scripts/verify-public-api-naming.js`
- Modify: `scripts/verify-internal-function-naming.js`
- Modify: `scripts/audit-function-naming.js`
- Create: `scripts/test-project-architecture.js`

- [ ] **Step 1: Add a failing target-architecture contract**

Create `scripts/test-project-architecture.js` with assertions for the final roots and dependency rules. At this stage keep the legacy-directory removal assertion behind a finalization flag so the suite can stay green during incremental migration.

```js
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const src = (...parts) => path.join(ROOT, 'src', ...parts);

assert.ok(fs.existsSync(src('backend')), 'src/backend must exist');
assert.ok(fs.existsSync(src('frontend')), 'src/frontend must exist');
assert.ok(fs.existsSync(src('appsscript.json')), 'manifest must remain at src/appsscript.json');
```

Run:

```bash
node scripts/test-project-architecture.js
```

Expected: **FAIL** because `src/backend` and `src/frontend` do not exist yet.

- [ ] **Step 2: Make repository scanners understand the new roots**

Change scanners from hardcoded `src/000_server` to explicit backend/frontend roots once those roots exist. During the migration window, scanner root selection may temporarily use:

```js
function existingRoot_(preferred, legacy) {
  return fs.existsSync(preferred) ? preferred : legacy;
}
```

Use it only inside scripts, not production code. The final task removes every legacy fallback.

`verify-frontend-api-mapping.js` should resolve:

```js
const backendRoot = existingRoot_(path.join(srcRoot, 'backend'), path.join(srcRoot, '000_server'));
const frontendRoot = existingRoot_(path.join(srcRoot, 'frontend'), srcRoot);
```

Ensure legacy backend files are excluded from frontend scanning while transitional state exists.

- [ ] **Step 3: Create the two roots without moving behavior yet**

Create placeholder-free tracked files by moving the first production files in Task 2; do **not** commit empty `.gitkeep` architecture. For this step only, create `src/backend/README`/`src/frontend/README` is prohibited. Instead defer the passing architecture test until Task 2's first move.

- [ ] **Step 4: Commit only scanner preparation and architecture test**

```bash
git add scripts/test-project-architecture.js scripts/verify-frontend-api-mapping.js scripts/verify-frontend-api-contract-v1.js scripts/verify-public-api-naming.js scripts/verify-internal-function-naming.js scripts/audit-function-naming.js
git commit -m "test: prepare architecture migration guards"
```

The new architecture test is expected to remain failing only on the feature branch until the first move commit immediately follows; do not push an intermediate red commit if branch CI runs on every push.

---

## Task 2: Move backend app/core foundation without changing behavior

**Files:**
- Move: `src/000_server/Code.js` → `src/backend/app/routing/Code.js`
- Move: `src/000_server/001_init/authorize_app.gs` → `src/backend/app/bootstrap/authorize_app.gs`
- Move: `src/000_server/010_core/config.gs` → `src/backend/app/config/config.gs`
- Move: `src/000_server/010_core/api_request.gs` → `src/backend/core/response/api_request.gs`
- Move: `src/000_server/010_core/api_handler.gs` → `src/backend/core/response/api_handler.gs`
- Move: `src/000_server/010_core/response.gs` → `src/backend/core/response/response.gs`
- Move: `src/000_server/010_core/api_access.gs` → `src/backend/core/auth/api_access.gs`
- Move: `src/000_server/010_core/sheet_crud.gs` → `src/backend/core/db/sheet_crud.gs`
- Move: `src/000_server/010_core/sheets.gs` → `src/backend/core/db/sheets.gs`
- Move: `src/000_server/010_core/business_audit.gs` → `src/backend/core/audit/business_audit.gs`
- Move: `src/000_server/020_schema/*` → `src/backend/core/db/schema/*`
- Move session/context infrastructure from `src/000_server/030_auth/` to `src/backend/core/auth/` except `auth_api.gs`
- Modify path-sensitive tests listed below.

**Tests to update first:**
- `scripts/test-core.js`
- `scripts/test-api-contract-v1-server.js`
- `scripts/test-api-access-contract.js`
- `scripts/test-business-audit-target-schema.js`
- `scripts/test-operation-user-fk-semester-normalization.js`

- [ ] **Step 1: Change one test group to the target paths and confirm failure**

For example in `test-api-access-contract.js`:

```js
var requestPath = path.join(ROOT, 'src/backend/core/response/api_request.gs');
var responsePath = path.join(ROOT, 'src/backend/core/response/response.gs');
var accessPath = path.join(ROOT, 'src/backend/core/auth/api_access.gs');
var handlerPath = path.join(ROOT, 'src/backend/core/response/api_handler.gs');
```

Run:

```bash
node scripts/test-api-access-contract.js
```

Expected: **FAIL / ENOENT**.

- [ ] **Step 2: Perform move-only changes**

Use `git mv`; preserve contents and function names exactly. Do not split `doGet()` yet beyond its physical placement.

- [ ] **Step 3: Update remaining foundation test paths and scanners**

Change schema/config paths in business-audit and operation-normalization tests to `src/backend/...`.

- [ ] **Step 4: Verify foundation behavior**

```bash
node scripts/test-core.js
node scripts/test-api-contract-v1-server.js
node scripts/test-api-access-contract.js
node scripts/test-business-audit-target-schema.js
node scripts/test-operation-user-fk-semester-normalization.js
node scripts/verify-public-api-naming.js
node scripts/verify-internal-function-naming.js
node scripts/test-project-architecture.js
git diff --check
```

Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add src/backend scripts
git commit -m "refactor: move backend foundation into app and core"
```

---

## Task 3: Migrate IAM and absorb Settings backend into the IAM boundary

**Files:**
- Move: `src/000_server/030_auth/auth_api.gs` → `src/backend/domains/iam/controllers/auth_controller.gs`
- Move IAM `*_sheet_dao.gs` → `src/backend/domains/iam/repositories/`
- Move IAM `*_query_service.gs` / access services → `src/backend/domains/iam/application/` initially
- Extract pure permission/role rules where appropriate → `src/backend/domains/iam/business_rules/`
- Move Settings APIs from `src/000_server/070_settings/**/**_api.gs` → `src/backend/domains/iam/controllers/`
- Move Settings query/mutation services → `src/backend/domains/iam/application/`
- Keep Settings screen/public API names unchanged.
- Update: `scripts/test-auth-iam.js`, `scripts/test-mypage-auth.js`, `scripts/test-api-contract-v1-settings.js`, `scripts/test-domain-access-resolvers.js`

- [ ] **Step 1: Point IAM tests at target files and confirm ENOENT**

Example:

```js
load_(context, 'src/backend/domains/iam/application/permissions_query.gs');
load_(context, 'src/backend/domains/iam/controllers/auth_controller.gs');
```

Run:

```bash
node scripts/test-mypage-auth.js
```

Expected: FAIL before moves.

- [ ] **Step 2: Move repository files without logic changes**

Rename DAO terminology to repository terminology only when the ownership verifier and all references are changed in the same commit. Function names may remain temporarily to avoid combining path migration with API/internal symbol refactors.

- [ ] **Step 3: Move IAM application files and controllers**

Map current responsibilities:

```text
users_query_service.gs        → application/users_query.gs
roles_query_service.gs        → application/roles_query.gs
permissions_query_service.gs  → application/permissions_query.gs
permissions_access_service.gs → application/permissions_access.gs
departments_query_service.gs  → application/departments_query.gs
```

- [ ] **Step 4: Absorb Settings server files**

Map:

```text
settings_*_api.gs              → controllers/settings_*_controller.gs
settings_*_query_service.gs    → application/settings_*_query.gs
settings_*_mutation_service.gs → application/settings_*_mutation.gs
settings_access.gs             → application/settings_access.gs
settings_shell_query_service.gs→ application/settings_shell_query.gs
```

No `backend/domains/settings` directory is created.

- [ ] **Step 5: Extract only demonstrably pure rules**

If a block performs only validation/state decision and has no repository/session/API dependency, extract it under `business_rules/`. Do not manufacture wrappers around existing application functions.

- [ ] **Step 6: Verify**

```bash
node scripts/test-auth-iam.js
node scripts/test-mypage-auth.js
node scripts/test-api-contract-v1-settings.js
node scripts/test-domain-access-resolvers.js
node scripts/test-api-contract-v1-server.js
node scripts/verify-public-api-naming.js
node scripts/verify-internal-function-naming.js
git diff --check
```

- [ ] **Step 7: Commit**

```bash
git commit -am "refactor: migrate iam and settings backend boundary"
```

---

## Task 4: Migrate Event backend and publish an Accounting-facing Application facade

**Files:**
- `src/000_server/050_event/051_events/events_api.gs` → `src/backend/domains/event/controllers/events_controller.gs`
- `.../events_query_service.gs` → `.../application/events_query.gs`
- `.../events_service.gs` → `.../application/events_mutation.gs`
- `.../events_sheet_dao.gs` → `.../repositories/events_repository.gs`
- `.../events_validator.gs` → `.../business_rules/events_rules.gs`
- Applicants/payment/attendance/refunds `*_api` → controllers
- Their `*_service` / `*_query_service` → application
- Their `*_sheet_dao` → repositories
- Form/file readers/adapters remain infrastructure-facing repository/adapter code, not Business Rules.
- Create: `src/backend/domains/event/application/event_reference_facade.gs`
- Update Event tests.

- [ ] **Step 1: Add a failing facade contract**

Add to an Event/Accounting boundary test an assertion that a function such as:

```js
function listAccountingEventReferences_(request) { /* application-level DTO only */ }
```

exists in `event_reference_facade.gs`, and that Accounting files do not call Event repository symbols.

Run the boundary test; expect FAIL before creation.

- [ ] **Step 2: Move Event API/application/repository files**

Preserve public APIs and current function outputs.

- [ ] **Step 3: Extract pure validators/rules**

`events_validator.gs` is the first candidate. Keep FormApp/DriveApp readers outside `business_rules`.

- [ ] **Step 4: Implement the public Application facade**

Facade returns only fields Accounting needs for reference/options; it may call Event repositories internally. It must not expose row numbers, sheet names, or raw persistence rows.

- [ ] **Step 5: Verify**

```bash
node scripts/test-event.js
node scripts/test-event-consistency-hardening.js
node scripts/test-domain-access-resolvers.js
node scripts/verify-public-api-naming.js
node scripts/verify-internal-function-naming.js
git diff --check
```

- [ ] **Step 6: Commit**

```bash
git commit -am "refactor: migrate event backend layers"
```

---

## Task 5: Migrate Accounting backend and separate orchestration from Business Rules

**Files:**
- `061_ledger/ledger_api.gs` → `domains/accounting/controllers/ledger_controller.gs`
- `061_ledger/ledger_read_service.gs` → `domains/accounting/application/ledger_query.gs`
- `061_ledger/ledger_service.gs` → `domains/accounting/application/ledger_mutation.gs`
- `061_ledger/ledger_sheet_dao.gs` → `domains/accounting/repositories/ledger_repository.gs`
- Evidence equivalents → controllers/application/repositories
- Reconciliation equivalents → controllers/application/repositories
- Settlement equivalents → controllers/application/repositories
- `bank_transaction_parser.gs`, pure reconciliation matching/scoring, settlement metric calculation, ledger validation/state transitions → `business_rules/` when free of Apps Script infrastructure.
- Remove `accounting_event_read_dao.gs`; replace its usage with Event Application facade.
- Update all Accounting v2/contract tests.

- [ ] **Step 1: Update `test-accounting-boundary-contract.js` to target layered paths**

New checks must include:

```text
business_rules files contain no SpreadsheetApp / DriveApp / Session
accounting files contain no event repository/DAO symbols
controllers contain no direct sheet primitives
```

Run test; expect FAIL before migration.

- [ ] **Step 2: Move controllers and repositories first**

Keep behavior identical, then run API/schema/bank/evidence tests.

- [ ] **Step 3: Move service files into Application**

Treat query services and mutation/orchestration services as Application by default. Do not assume every helper is a Business Rule.

- [ ] **Step 4: Extract tested pure Business Rules**

Use existing tests as extraction seams:

- `buildReconciliationSnapshotItems_` and pure match/score logic → reconciliation rules
- `buildSettlementSnapshotMetrics_` → settlement rules
- money/date/status validation → ledger rules
- bank transaction parsing that is independent of Drive/Sheets → bank transaction rules/parser

Run the relevant test after each extraction.

- [ ] **Step 5: Replace Event persistence coupling**

Delete `accounting_event_read_dao.gs` only after every caller uses `listAccountingEventReferences_()` or another explicitly public Event Application facade.

- [ ] **Step 6: Verify full Accounting suite**

```bash
node scripts/test-accounting-boundary-contract.js
node scripts/test-accounting-db-v2-schema.js
node scripts/test-bank-transaction-v2.js
node scripts/test-ledger-bank-link-v2.js
node scripts/test-evidence-ocr-v2.js
node scripts/test-reconciliation-v2.js
node scripts/test-settlement-v2.js
node scripts/test-accounting.js
node scripts/test-accounting-money-validation.js
node scripts/verify-public-api-naming.js
node scripts/verify-internal-function-naming.js
git diff --check
```

- [ ] **Step 7: Commit**

```bash
git commit -am "refactor: migrate accounting backend layers"
```

---

## Task 6: Migrate Student Fee backend and update its architecture verifier

**Files:**
- API files → `src/backend/domains/student_fee/controllers/`
- query/mutation/import services → `.../application/`
- `student_fee_coverage_policy.gs` → `.../business_rules/student_fee_coverage_rules.gs`
- all `*_sheet_dao.gs` → `.../repositories/*_repository.gs`
- `student_fee_form_settings_adapter.gs`, `fee_form_reader.gs` → `.../repositories/adapters/`
- `fee_form_mapper.gs` → repository mapper unless it contains business decisions; business decisions extracted separately.
- Modify: `scripts/verify-student-fee-architecture.js`
- Modify Student Fee tests.

- [ ] **Step 1: Rewrite verifier ownership table to target architecture and confirm failure**

The verifier should assert controller/application/business_rules/repositories ownership instead of numbered directories and `*_sheet_dao` naming.

Run:

```bash
node scripts/verify-student-fee-architecture.js
```

Expected: FAIL before moves.

- [ ] **Step 2: Move files by responsibility**

Preserve `FormApp` isolation: only the Form reader adapter may access FormApp. Preserve idempotency and audit contracts.

- [ ] **Step 3: Extract coverage calculation as a pure rule**

Keep `calculateStudentFeeCoverage_` infrastructure-free.

- [ ] **Step 4: Verify**

```bash
node scripts/test-student-fee.js
node scripts/test-student-fee-form-source.js
node scripts/test-student-fee-form-import.js
node scripts/test-student-fee-mutation-consistency.js
node scripts/verify-student-fee-architecture.js
node scripts/test-business-audit-taxonomy.js
node scripts/test-business-audit-target-schema.js
git diff --check
```

- [ ] **Step 5: Commit**

```bash
git commit -am "refactor: migrate student fee backend layers"
```

---

## Task 7: Move frontend app shell/shared infrastructure before feature slicing

**Files:**
- `src/100_common/App_Header.html` → `src/frontend/widgets/header/App_Header.html`
- `src/100_common/App_Sidebar.html` → `src/frontend/widgets/sidebar/App_Sidebar.html`
- `src/100_common/app_api_runner_js.html` → `src/frontend/shared/api/rpc/app_api_runner_js.html`
- `src/100_common/app_client_js.html` → `src/frontend/shared/api/app_client_js.html`
- `src/100_common/app_shell_js.html` → `src/frontend/app/bootstrap/app_shell_js.html`
- `src/100_common/App_Shell_Styles.html` → `src/frontend/app/styles/App_Shell_Styles.html`
- Split `App_Styles.html` into app/shared style ownership without changing rendered appearance.
- `Access_Denied.html` → `src/frontend/pages/access_denied/Access_Denied.html`
- Modify every page template include path and `src/backend/app/routing/Code.js` route target.
- Modify shell/API frontend tests and verifiers.

- [ ] **Step 1: Update shell/API tests to target paths and confirm failure**

Update:

```text
scripts/test-frontend-app-shell.js
scripts/test-frontend-app-shell-behavior.js
scripts/test-app-api-runner.js
scripts/test-api-contract-v1-common-frontend.js
scripts/test-accounting-sidebar-group.js
scripts/verify-frontend-api-contract-v1.js
```

Run the shell and runner tests; expect ENOENT.

- [ ] **Step 2: Move shared shell files**

Do not feature-slice Accounting/Event/Student Fee yet. This task is physical/common infrastructure migration only.

- [ ] **Step 3: Change `include()` strings in all templates**

Examples:

```html
<?!= include('frontend/widgets/header/App_Header'); ?>
<?!= include('frontend/shared/api/rpc/app_api_runner_js'); ?>
```

- [ ] **Step 4: Update `Code.js` route targets**

Point routes to `frontend/pages/...` as each page moves in Tasks 8–10. During this task, either move basic `login/main/mypage/access_denied` pages together or keep their current routes until their dedicated move; never point a route to a missing template.

- [ ] **Step 5: Verify shared frontend contract**

```bash
node scripts/test-frontend-app-shell.js
node scripts/test-frontend-app-shell-behavior.js
node scripts/test-app-api-runner.js
node scripts/test-api-contract-v1-common-frontend.js
node scripts/test-frontend-api-mapping.js
node scripts/verify-frontend-api-contract-v1.js
node scripts/verify-frontend-api-mapping.js
git diff --check
```

- [ ] **Step 6: Commit**

```bash
git commit -am "refactor: move frontend app shell and shared infrastructure"
```

---

## Task 8: Migrate Login/Main/MyPage/Settings frontend slices

**Files:**
- Move `src/200_login` → `src/frontend/pages/login`
- Move `src/250_main` → `src/frontend/pages/main`
- Move `src/270_mypage` → `src/frontend/pages/mypage`
- Move Settings page folders → `src/frontend/pages/settings_*`
- Move `src/300_settings/common/settings_client_js.html` to a domain-aware location such as `src/frontend/entities/user/api/` or Settings features; do not place it in `shared`.
- Extract user/profile entity rendering and Settings mutation features only where code has meaningful independent behavior.
- Update routing/includes/tests.

- [ ] **Step 1: Change Settings/common frontend tests to new target paths and confirm failure**

Run:

```bash
node scripts/test-api-contract-v1-settings.js
node scripts/test-mypage-auth.js
```

- [ ] **Step 2: Move page shells first**

Each page gets a page-owned controller responsible only for initialization/composition.

- [ ] **Step 3: Extract action-heavy Settings code to features**

Candidate features:

```text
features/settings_user_edit
features/settings_role_edit
features/settings_permission_edit
```

Do not create a feature for read-only trivial DOM display.

- [ ] **Step 4: Verify routing and API contract**

Run Settings, common frontend, shell, mapping tests.

- [ ] **Step 5: Commit**

```bash
git commit -am "refactor: migrate iam and settings frontend slices"
```

---

## Task 9: Migrate Accounting frontend to FSD Lite

**Files:**
- Move page shells to `src/frontend/pages/accounting_home`, `accounting_ledger`, `accounting_reconciliation`, `accounting_settlement`
- Move `accounting_client_js.html` out of old `common`; keep semantic Accounting API code domain-aware (entity/feature API), while transport remains `shared/api/rpc`.
- Extract from `accounting_ledger_js.html`:
  - page init → `pages/accounting_ledger/accounting_ledger_page_controller_js.html`
  - register behavior/modal → `features/ledger_create/`
  - detail behavior/modal → `features/ledger_detail/`
  - approval behavior → `features/ledger_approve/`
  - ledger row/table rendering → `widgets/ledger_table/` and/or `entities/ledger/`
- Reconciliation action logic → `features/reconciliation_run/` and relevant entity/widget code.
- Settlement rendering/actions similarly split only where meaningful.

- [ ] **Step 1: Convert Accounting frontend contract tests to target paths and confirm failure**

Update:

```text
scripts/test-api-contract-v1-accounting-frontend.js
scripts/test-frontend-api-mapping.js
scripts/test-accounting-sidebar-group.js
```

- [ ] **Step 2: Move page shells and styles without logic changes**

Run tests and restore green.

- [ ] **Step 3: Extract one feature at a time from the ~19KB ledger controller**

For each feature: add/adjust a test asserting ownership, make it fail, extract, then pass. Do not extract multiple unrelated actions in one commit.

- [ ] **Step 4: Extract reconciliation and settlement slices**

Preserve current snapshot unwrapping and labels covered by `test-frontend-api-mapping.js`.

- [ ] **Step 5: Verify**

```bash
node scripts/test-api-contract-v1-accounting-frontend.js
node scripts/test-accounting-sidebar-group.js
node scripts/test-frontend-api-mapping.js
node scripts/verify-frontend-api-contract-v1.js
node scripts/verify-frontend-api-mapping.js
git diff --check
```

- [ ] **Step 6: Commit**

```bash
git commit -am "refactor: migrate accounting frontend to fsd slices"
```

---

## Task 10: Migrate Student Fee and Event frontend slices

**Files:**
- Student Fee pages → `src/frontend/pages/student_fee_*`
- Student Fee actions → features such as payer_edit, payment_approve, refund_approve
- Student Fee data rendering → entities payment/refund/payer where reusable
- Event pages → `src/frontend/pages/event_home`, `event_form`, `event_detail`
- Event create/edit behavior → feature(s)
- Applicant modal/status actions → feature(s)
- Large applicant/table compositions → widgets/entities as appropriate
- Existing page-owned modal partial rule remains valid: the page composes feature-owned UI; views do not duplicate modal markup.

- [ ] **Step 1: Update Student Fee/Event frontend regression paths and confirm failure**

Run:

```bash
node scripts/test-student-fee-frontend.js
node scripts/test-event-creation-frontend.js
```

- [ ] **Step 2: Move Student Fee shells, then extract behaviors covered by tests**

Preserve calculate-before-mutate order, busy guard, modal-on-error behavior, and bulk refund payload contract.

- [ ] **Step 3: Move Event shells, then extract behaviors covered by tests**

Preserve manager=current-login-user display, form toggles, event detail rendering, and modal composition contracts.

- [ ] **Step 4: Verify domain frontend suites and mapping**

```bash
node scripts/test-student-fee-frontend.js
node scripts/test-event-creation-frontend.js
node scripts/test-frontend-api-mapping.js
node scripts/verify-frontend-api-contract-v1.js
node scripts/verify-frontend-api-mapping.js
git diff --check
```

- [ ] **Step 5: Commit**

```bash
git commit -am "refactor: migrate student fee and event frontend slices"
```

---

## Task 11: Remove legacy numbered roots and make architecture enforcement strict

**Files:**
- Remove now-empty: `src/000_server`, `src/100_common`, `src/200_login`, `src/250_main`, `src/270_mypage`, `src/300_settings`, `src/400_accounting`, `src/500_student_fee`, `src/600_event`
- Modify: `scripts/test-project-architecture.js`
- Modify all verifier scripts to remove legacy fallback.
- Modify all GitHub Actions path filters.
- Modify: `README.md`
- Modify relevant `directory_docs/*` if they describe source layout.

- [ ] **Step 1: Make architecture contract strict**

Add:

```js
[
  '000_server', '100_common', '200_login', '250_main', '270_mypage',
  '300_settings', '400_accounting', '500_student_fee', '600_event'
].forEach(name => {
  assert.ok(!fs.existsSync(src(name)), `legacy source root must be removed: ${name}`);
});
```

Also recursively assert:

- no `backend/core` file references `/domains/`
- no `business_rules` file contains `SpreadsheetApp`, `DriveApp`, `FormApp`, `Session`, `google.script.run`
- no frontend file outside `shared/api/rpc` contains `google.script.run`
- no backend domain references another domain's `/repositories/`

Run before cleanup; expect FAIL.

- [ ] **Step 2: Remove empty legacy directories and stale references**

Search:

```bash
grep -R "src/000_server\|src/100_common\|src/300_settings\|src/400_accounting\|src/500_student_fee\|src/600_event" scripts .github README.md directory_docs || true
```

Expected after cleanup: no live-code/test/workflow path references.

- [ ] **Step 3: Remove transitional scanner fallbacks**

All verifiers must use only:

```text
src/backend
src/frontend
```

- [ ] **Step 4: Update CI workflow paths**

Examples:

```yaml
- 'src/backend/**'
- 'src/frontend/**'
```

Student Fee should target `src/backend/domains/student_fee/**` plus relevant frontend slices and schema paths. Frontend mapping should scan `src/frontend/**` and `src/backend/**/*.gs`.

- [ ] **Step 5: Update README architecture**

Document the exact finalized tree, layer responsibilities, composition-over-inheritance rule, cross-domain facade rule, and FSD Lite dependency direction.

- [ ] **Step 6: Run the full Node regression + verifier suite**

```bash
set -euo pipefail
for test_file in scripts/test-*.js; do
  echo "==> $test_file"
  node "$test_file"
done
for verify_file in scripts/verify-*.js; do
  [ -e "$verify_file" ] || continue
  echo "==> $verify_file"
  node "$verify_file"
done
git diff --check
```

Expected: all PASS, no legacy path dependency.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "refactor: finalize project architecture migration"
```

---

## Task 12: Final CI/Apps Script compatibility review

**Files:** no intentional production behavior changes; fix only issues exposed by verification.

- [ ] **Step 1: Confirm Apps Script file conventions**

Ensure all `.gs`, `.js`, `.html` files remain beneath the clasp root and `src/appsscript.json` is unchanged unless a proven deployment requirement says otherwise.

- [ ] **Step 2: Confirm route/include paths are valid**

Search every `include('...')` and every `routes` target in `src/backend/app/routing/Code.js`; assert the corresponding `.html` file exists.

- [ ] **Step 3: Confirm frontend/server API mapping**

```bash
node scripts/test-frontend-api-mapping.js
node scripts/verify-frontend-api-mapping.js
node scripts/verify-public-api-naming.js
node scripts/verify-internal-function-naming.js
```

- [ ] **Step 4: Confirm full suite one final time**

Run the same complete loops from Task 11 plus `git diff --check`.

- [ ] **Step 5: Inspect GitHub Actions on the branch/PR**

All required workflows must be green. Any legacy workflow path filter that prevents execution is itself a defect and must be corrected before merge.

- [ ] **Step 6: Do not deploy automatically as part of the structural refactor**

`clasp push` / redeploy is a separate explicit deployment action after review. The refactor completion criterion is repository tests + CI green with preserved contracts.

- [ ] **Step 7: Final commit if verification-only fixes were required**

```bash
git add -A
git commit -m "fix: harden architecture migration verification"
```

## Completion criteria

The refactor is complete only when all of the following are true:

1. `src/backend` and `src/frontend` are the only application-code roots below `src/` besides `appsscript.json`.
2. Backend code follows Controller/Application/Business Rules/Repository responsibilities without mandatory empty layers.
3. Business Rules are infrastructure-free.
4. Cross-domain backend access goes through Application facades, not repositories/controllers.
5. Frontend follows FSD Lite dependency direction and `shared` is business-agnostic.
6. Only the shared RPC transport touches `google.script.run` directly.
7. Existing public API names and response contracts remain compatible.
8. All `scripts/test-*.js`, `scripts/verify-*.js`, and GitHub Actions pass.
9. `git diff --check` passes.
10. README/documentation describes the new architecture rather than the numbered legacy structure.
