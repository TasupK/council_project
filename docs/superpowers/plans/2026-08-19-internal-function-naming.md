# Internal Function Naming Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 내부 함수명만 일관된 동사/레이어 규약으로 정리하고 public `api_*` 계약은 유지한다.

**Architecture:** 함수명은 레이어 접두사 대신 동사의 의미로 책임을 드러낸다. Query/Application 경계는 `*Data_`, DAO는 `find*/list*`, 외부/저수준 읽기는 `read*`, 순수 변환은 `build/map/resolve/parse/normalize/calculate`, guard는 `assert/require`, mutation은 `create/update/process/confirm/apply`로 제한한다. 이름 변경은 symbol rename만 수행하며 동작은 변경하지 않는다.

**Tech Stack:** Google Apps Script JavaScript, Node.js regression/architecture scripts, GitHub Actions temporary verification.

**Spec:** `docs/superpowers/specs/2026-08-18-internal-function-naming-design.md`

## Global Constraints

- Public `api_*` 함수명은 변경하지 않는다.
- GAS entry point와 외부 계약 함수는 rename 대상에서 제외한다.
- 내부 함수는 기존 trailing underscore 관례를 유지한다.
- `Data_` suffix는 Query/Application Service 결과와 domain mutation service에만 사용한다.
- DAO collection read는 `list*`, 단건/조건 조회는 `find*`를 사용한다.
- `process*`는 승인/반려/복합 상태전이에만 사용한다.
- rename 중 비즈니스 로직, 응답 shape, lock, permission, Drive/Sheet 동작을 변경하지 않는다.
- 모든 rename은 정의와 모든 참조/테스트/verifier를 함께 갱신한다.

---

### Task 1: Internal Function Inventory and Rename Map

**Files:**
- Create: `docs/superpowers/specs/2026-08-19-internal-function-rename-map.md`
- Create: `scripts/verify-internal-function-naming.js`

**Interfaces:**
- Consumes: approved naming design spec.
- Produces: explicit old→new symbol map and executable naming guardrail.

- [ ] **Step 1: Build the inventory**

Scan `src/000_server/**/*.gs` for named functions ending in `_`, excluding `api_*` and documented GAS/external entry points. Classify each by file/role: query service, mutation service, DAO, mapper/reader, access/guard, utility.

- [ ] **Step 2: Write the rename map**

Record only functions whose current verb conflicts with the approved role. Keep already-conforming names unchanged. Each row must include `old`, `new`, `file`, `role`, and `reason`.

- [ ] **Step 3: Write a failing naming verifier**

The verifier must reject newly introduced internal names using ambiguous verbs (`handle`, `execute`) and flag known nonconforming symbols listed in the rename map until migration is complete. It must explicitly ignore public `api_*` functions.

- [ ] **Step 4: Run verifier and confirm RED**

Run: `node scripts/verify-internal-function-naming.js`
Expected: FAIL naming the mapped legacy symbols.

- [ ] **Step 5: Commit inventory/guardrail**

Commit only the rename map and RED verifier.

---

### Task 2: DAO and Read-Side Rename Migration

**Files:**
- Modify: DAO/read/query files under `src/000_server/020_schema`, `040_iam`, `050_event`, `060_accounting`, `080_student_fee`
- Modify: affected `scripts/test-*.js` and `scripts/verify-*.js`

**Interfaces:**
- Consumes: Task 1 rename map.
- Produces: consistent `find*`/`list*`/`read*`/`get*Data_` naming on the read side.

- [ ] **Step 1: Rename collection DAO functions**

Convert mapped `findAll*`/misused `get*Rows*` helpers that are direct collection persistence reads to `list*` equivalents.

- [ ] **Step 2: Rename external/low-level readers**

Use `read*` only where the function reads a source such as Sheet/Drive/Form without returning an application DTO.

- [ ] **Step 3: Rename query composition functions**

Use `get*Data_` for final query/application outputs and `build*` for indexes/DTO structures constructed from already-loaded values.

- [ ] **Step 4: Update all references and tests**

Perform symbol-safe replacements across server sources and scripts. Do not alter `api_*` identifiers.

- [ ] **Step 5: Run focused domain tests**

Run all existing Event, Accounting, Student Fee, Auth/IAM, Settings and Core behavior tests touched by the symbols.

---

### Task 3: Mutation, Guard, and Pure-Helper Rename Migration

**Files:**
- Modify: service/access/mapper/common files under `src/000_server`
- Modify: affected tests/verifiers

**Interfaces:**
- Consumes: Task 1 rename map.
- Produces: consistent mutation and pure-helper verbs.

- [ ] **Step 1: Normalize mutation service names**

Use `create*Data_`, `update*Data_`, `process*Data_`, `confirm*Data_`, `apply*Data_` strictly according to the approved semantics.

- [ ] **Step 2: Normalize pure helper names**

Use `build*`, `map*`, `resolve*`, `parse*`, `normalize*`, `calculate*` according to responsibility. Do not rename just for stylistic preference if the current verb already matches semantics.

- [ ] **Step 3: Normalize guards**

Use `assert*` for domain invariant validation that throws and `require*` for authentication/permission/required-context enforcement.

- [ ] **Step 4: Update all references/tests/verifiers**

Ensure no old mapped symbol remains in server or test code.

- [ ] **Step 5: Run naming verifier**

Run: `node scripts/verify-internal-function-naming.js`
Expected: PASS.

---

### Task 4: Regression and Architecture Verification

**Files:**
- Modify only if tests expose stale symbol expectations.
- Temporary: `.github/workflows/internal-function-naming-verify.yml`, `verification/internal-function-naming-*` during CI evidence collection; remove before final handoff.

**Interfaces:**
- Consumes: renamed code from Tasks 2–3.
- Produces: evidence that rename is behavior-preserving.

- [ ] **Step 1: Verify syntax for every server `.gs` file**

Use Node `vm.Script` based syntax checks already present in the repository.

- [ ] **Step 2: Run every behavior test**

Run all `scripts/test-*.js`.

- [ ] **Step 3: Run every architecture verifier**

Run all `scripts/verify-*.js`, including the new naming verifier.

- [ ] **Step 4: Verify public API stability**

Compare public `api_*` function inventory before/after and fail if any public identifier was removed or renamed.

- [ ] **Step 5: Remove temporary verification workflow/logs**

Keep permanent tests/verifiers and documentation; remove only temporary CI evidence artifacts.

- [ ] **Step 6: Final diff review**

Confirm changes consist of symbol renames, tests/verifiers, and naming documentation only, with no unrelated behavior modifications.
