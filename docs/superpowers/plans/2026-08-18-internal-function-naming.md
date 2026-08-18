# Internal Function Naming Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Standardize internal server function names so the leading verb consistently communicates layer and side-effect semantics while preserving all public `api_*` contracts and runtime behavior.

**Architecture:** This is a symbol-only refactor across the existing GAS global namespace. A lightweight naming verifier first inventories and classifies internal functions, then renames are applied in domain-sized batches with all call sites/tests/verifiers updated atomically. No compatibility aliases remain for renamed private helpers.

**Tech Stack:** Google Apps Script JavaScript (`.gs`), Node.js VM-based test harnesses, existing `scripts/test-*.js` and `scripts/verify-*.js` checks.

**Spec:** `docs/superpowers/specs/2026-08-18-internal-function-naming-design.md`

## Global Constraints

- Public `api_*` function names are unchanged.
- GAS/public entry points such as `doGet` / `doPost` remain unchanged if present.
- Internal project helpers continue to use a trailing underscore `_`.
- `get*Data_` is reserved for final query/application results.
- Domain mutation service commands use `create*Data_`, `update*Data_`, `delete*Data_`, `process*Data_`, `confirm*Data_`, or `apply*Data_` according to semantics.
- DAO collection reads prefer `list*`; nullable single lookups use `find*`.
- `read*` is reserved for external/low-level source reads.
- `build*`, `map*`, `resolve*`, `parse*`, `normalize*`, and `calculate*` remain side-effect-free or decision/transformation oriented.
- `assert*` throws on domain invariant failure; `require*` throws for required auth/context/presence.
- Behavior, parameters, return values, errors, lock behavior, persistence behavior, routes, schemas, and request/response contracts must not change.
- No temporary aliases after a rename batch unless the symbol is a documented external GAS integration.

---

### Task 1: Add internal-function inventory and naming guardrail

**Files:**
- Create: `scripts/verify-function-naming.js`
- Test: `scripts/verify-function-naming.js`

**Interfaces:**
- Consumes: all function declarations under `src/000_server/**/*.{gs,js}`.
- Produces: a deterministic naming report and non-zero exit code for high-confidence naming violations.

- [ ] **Step 1: Write the verifier in RED mode against current code**

Implement a Node script that recursively scans server `.gs/.js` files, extracts `function name(` declarations, excludes `api_*` and explicit GAS/public entry points, and reports:

```js
{
  file: relativePath,
  name: functionName,
  reason: 'missing-private-suffix' | 'banned-vague-prefix' | 'dao-data-suffix' | 'legacy-symbol'
}
```

Initial high-confidence rules:

```js
const PUBLIC_ALLOWLIST = new Set(['doGet', 'doPost']);
const BANNED_PRIVATE_PREFIXES = ['handle', 'execute'];
```

The script must also expose an explicit `LEGACY_SYMBOLS` list populated by later rename tasks.

- [ ] **Step 2: Run the verifier and capture the current violations**

Run:

```bash
node scripts/verify-function-naming.js
```

Expected: FAIL on current naming inconsistencies, while leaving public `api_*` names untouched.

- [ ] **Step 3: Ensure the verifier does not overreach into semantic inference**

Keep checks structural only. Do not reject every `process*`; only reject symbols explicitly listed as legacy/ambiguous after inventory review. Do not parse JavaScript AST beyond function declarations.

- [ ] **Step 4: Commit the guardrail baseline**

```bash
git add scripts/verify-function-naming.js
git commit -m "test: add internal function naming guardrail"
```

---

### Task 2: Build and freeze the rename map

**Files:**
- Modify: `scripts/verify-function-naming.js`
- Create: `docs/superpowers/plans/2026-08-18-internal-function-rename-map.md`

**Interfaces:**
- Consumes: inventory from Task 1 and naming rules from the spec.
- Produces: explicit `oldName -> newName` mappings grouped by Core/Schema/Auth/IAM, Event, Accounting, Student Fee, and Settings.

- [ ] **Step 1: Inventory every private server function**

Generate a sorted list of declarations excluding public APIs/platform entry points. Classify each by file path and current leading verb.

- [ ] **Step 2: Add only high-confidence rename candidates to the map**

Use this decision table:

```text
raw collection DAO findAll*     -> list*
nullable single DAO lookup      -> find*
final query/view result          -> get*Data_
external/raw source retrieval    -> read*
index/tree/payload construction  -> build*
choice/effective-value decision  -> resolve*
business create/update command   -> create*Data_ / update*Data_
approval/rejection transition    -> process*Data_
final payment/refund fact        -> confirm*Data_
change-set batch application     -> apply*Data_
```

Do not rename already-conforming names.

- [ ] **Step 3: Record exceptions explicitly**

The map document must contain an `Intentional exceptions` section for private names that do not fit a mechanical rule but are kept because their current verb accurately describes behavior.

- [ ] **Step 4: Feed old names into the verifier**

Populate `LEGACY_SYMBOLS` with every `oldName` from the approved map so stale declarations or references can be detected after migration.

- [ ] **Step 5: Commit the rename map**

```bash
git add scripts/verify-function-naming.js docs/superpowers/plans/2026-08-18-internal-function-rename-map.md
git commit -m "docs: freeze internal function rename map"
```

---

### Task 3: Rename Core / Schema / Auth / IAM internal helpers

**Files:**
- Modify: affected files under `src/000_server/010_core`, `020_schema`, `030_auth`, `040_iam`
- Modify: affected `scripts/test-*.js` and `scripts/verify-*.js`
- Test: `scripts/test-core.js`, `scripts/test-auth-iam.js`, `scripts/test-mypage-auth.js`, `scripts/verify-auth-iam-architecture.js`, `scripts/verify-server-architecture.js`, `scripts/verify-function-naming.js`

**Interfaces:**
- Consumes: exact rename map from Task 2.
- Produces: renamed private infrastructure/IAM symbols with unchanged behavior and no old-symbol references.

- [ ] **Step 1: Add a focused stale-symbol assertion**

Update `verify-function-naming.js` so any Core/Schema/Auth/IAM old symbol from the map fails whether it appears in a declaration or call site.

- [ ] **Step 2: Run targeted checks to verify RED**

```bash
node scripts/verify-function-naming.js
```

Expected: FAIL listing the old symbols in this batch.

- [ ] **Step 3: Rename declarations and all references atomically**

Apply symbol-only replacements across production source, test harnesses, and architecture verifiers. Do not modify function bodies except references to renamed helpers.

- [ ] **Step 4: Run targeted regression**

```bash
node scripts/test-core.js
node scripts/test-auth-iam.js
node scripts/test-mypage-auth.js
node scripts/verify-auth-iam-architecture.js
node scripts/verify-server-architecture.js
node scripts/verify-function-naming.js
```

Expected: PASS.

- [ ] **Step 5: Commit the batch**

```bash
git add src/000_server/010_core src/000_server/020_schema src/000_server/030_auth src/000_server/040_iam scripts
git commit -m "refactor: standardize core and iam internal function names"
```

---

### Task 4: Rename Event internal helpers

**Files:**
- Modify: affected files under `src/000_server/050_event`
- Modify: Event-related tests/verifiers under `scripts/`
- Test: `scripts/test-event.js`, `scripts/test-event-form-sync-*.js`, `scripts/test-event-consistency-hardening.js`, `scripts/verify-event-architecture.js`, `scripts/verify-event-form-sync-architecture.js`, `scripts/verify-function-naming.js`

**Interfaces:**
- Consumes: Event rename mappings from Task 2.
- Produces: Event query/service/DAO/reader/mapper naming aligned with the contract.

- [ ] **Step 1: Activate Event old-symbol failures in the guardrail**

Ensure Event old names in `LEGACY_SYMBOLS` are reported.

- [ ] **Step 2: Run Event naming check in RED state**

```bash
node scripts/verify-function-naming.js
```

Expected: FAIL on Event legacy symbols.

- [ ] **Step 3: Rename Event symbols and references**

Prioritize raw collection `findAll* -> list*`, ambiguous query/service verbs, and any transformation functions whose verb conflicts with actual responsibility. Preserve existing `get*Data_`, `process*Data_`, `build*`, `resolve*`, mapper, reader, and access names when already compliant.

- [ ] **Step 4: Run Event regression**

```bash
node scripts/test-event.js
node scripts/test-event-form-sync-api.js
node scripts/test-event-form-sync-frontend.js
node scripts/test-event-form-sync-mapper.js
node scripts/test-event-form-sync-service.js
node scripts/test-event-consistency-hardening.js
node scripts/verify-event-architecture.js
node scripts/verify-event-form-sync-architecture.js
node scripts/verify-function-naming.js
```

Expected: PASS.

- [ ] **Step 5: Commit the Event batch**

```bash
git add src/000_server/050_event scripts
git commit -m "refactor: standardize event internal function names"
```

---

### Task 5: Rename Accounting internal helpers

**Files:**
- Modify: affected files under `src/000_server/060_accounting`
- Modify: Accounting tests/verifiers under `scripts/`
- Test: `scripts/test-accounting.js`, `scripts/test-accounting-money-validation.js`, `scripts/verify-accounting-architecture.js`, `scripts/verify-function-naming.js`

**Interfaces:**
- Consumes: Accounting rename mappings from Task 2.
- Produces: Accounting query/service/DAO/file helper naming aligned with the contract.

- [ ] **Step 1: Verify Accounting old symbols fail the guardrail**

```bash
node scripts/verify-function-naming.js
```

Expected: FAIL on mapped Accounting old symbols.

- [ ] **Step 2: Rename Accounting symbols and references**

Keep money calculations under `calculate*`, final query outputs under `get*Data_`, direct persistence helpers under `insert/update/delete*Row*`, and approval/finalization commands under `process*Data_` or `confirm*Data_` according to their actual domain semantics.

- [ ] **Step 3: Run Accounting regression**

```bash
node scripts/test-accounting.js
node scripts/test-accounting-money-validation.js
node scripts/verify-accounting-architecture.js
node scripts/verify-function-naming.js
```

Expected: PASS.

- [ ] **Step 4: Commit the Accounting batch**

```bash
git add src/000_server/060_accounting scripts
git commit -m "refactor: standardize accounting internal function names"
```

---

### Task 6: Rename Student Fee internal helpers

**Files:**
- Modify: affected files under `src/000_server/080_student_fee`
- Modify: Student Fee tests/verifiers under `scripts/`
- Test: `scripts/test-student-fee.js`, `scripts/test-student-fee-mutation-consistency.js`, `scripts/test-student-fee-frontend.js`, `scripts/verify-student-fee-architecture.js`, `scripts/verify-student-fee-frontend.js`, `scripts/verify-function-naming.js`

**Interfaces:**
- Consumes: Student Fee rename mappings from Task 2.
- Produces: Student Fee query/service/DAO naming aligned with the same contract used by Event/Accounting.

- [ ] **Step 1: Verify Student Fee old symbols fail the guardrail**

```bash
node scripts/verify-function-naming.js
```

Expected: FAIL on mapped Student Fee old symbols.

- [ ] **Step 2: Rename Student Fee symbols and references**

Preserve the recently hardened mutation lifecycle and locks. Only change identifiers and call sites; do not alter prevalidation, duplicate prevention, fee/refund calculation, audit, or state transitions.

- [ ] **Step 3: Run Student Fee regression**

```bash
node scripts/test-student-fee.js
node scripts/test-student-fee-mutation-consistency.js
node scripts/test-student-fee-frontend.js
node scripts/verify-student-fee-architecture.js
node scripts/verify-student-fee-frontend.js
node scripts/verify-function-naming.js
```

Expected: PASS.

- [ ] **Step 4: Commit the Student Fee batch**

```bash
git add src/000_server/080_student_fee scripts
git commit -m "refactor: standardize student fee internal function names"
```

---

### Task 7: Rename Settings and remaining private helpers

**Files:**
- Modify: affected files under `src/000_server/070_settings` and any remaining private server files
- Modify: Settings-related tests/verifiers under `scripts/`
- Test: `scripts/test-settings.js`, `scripts/test-settings-departments.js`, `scripts/test-settings-department-chart.js`, `scripts/verify-settings-architecture.js`, `scripts/verify-function-naming.js`

**Interfaces:**
- Consumes: final remaining mappings from Task 2.
- Produces: no mapped legacy private symbols remaining anywhere in the server repository.

- [ ] **Step 1: Run naming verifier before the batch**

Expected: only Settings/remaining mapped old symbols fail.

- [ ] **Step 2: Rename remaining private symbols and references**

Do not rename public Settings functions that are intentionally external entry points and not private underscore helpers.

- [ ] **Step 3: Run Settings regression and naming verifier**

```bash
node scripts/test-settings.js
node scripts/test-settings-departments.js
node scripts/test-settings-department-chart.js
node scripts/verify-settings-architecture.js
node scripts/verify-function-naming.js
```

Expected: PASS with zero mapped legacy symbols.

- [ ] **Step 4: Commit the final rename batch**

```bash
git add src/000_server/070_settings scripts
git commit -m "refactor: standardize remaining internal function names"
```

---

### Task 8: Verify public API stability and full regression

**Files:**
- Modify only if verification reveals stale test expectations: `scripts/*`
- Test: every `scripts/test-*.js` and `scripts/verify-*.js`

**Interfaces:**
- Consumes: all renamed batches.
- Produces: evidence that public API names are unchanged, naming guardrails pass, and behavior/architecture regressions are absent.

- [ ] **Step 1: Compare public API declarations against the pre-rename baseline**

The verifier must assert that the set of `api_*` function names is unchanged from the baseline captured before Task 3.

- [ ] **Step 2: Run the naming guardrail**

```bash
node scripts/verify-function-naming.js
```

Expected: PASS.

- [ ] **Step 3: Run the full test suite**

```bash
set -e
for file in scripts/test-*.js; do node "$file"; done
for file in scripts/verify-*.js; do node "$file"; done
```

Expected: every test and verifier exits 0.

- [ ] **Step 4: Inspect diff for symbol-only scope**

Confirm production changes are limited to function declarations/call references and naming-verifier support. Any business-logic diff requires separate justification and must be removed from this refactor.

- [ ] **Step 5: Commit final verification adjustments if any**

```bash
git add scripts src/000_server docs/superpowers/plans/2026-08-18-internal-function-rename-map.md
git commit -m "test: enforce internal function naming consistency"
```
