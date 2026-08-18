# System Consistency Hardening Design

## 1. Goal

Unify the execution rules of server APIs across Event, Accounting, and Student Fee without introducing inheritance, classes, generic repositories, or a central domain registry in Core.

The system must use one declarative API contract for authentication and authorization, while each domain retains ownership of business rules, screen mappings, state transitions, money validation, and business-key integrity.

## 2. Scope

Included:
- Common API access declaration: `access: { domain, action, screenId? }`
- Common action semantics: `view`, `edit`, `approve`, `export`
- Admin bypass through the existing IAM contract
- Domain-owned access resolvers for Event, Accounting, and Student Fee
- Optional common mutation runner for lock/re-read/validate/write/audit lifecycle
- Consistent state-transition timestamps
- Consistent amount/type validation where money is mutated
- Concurrency-safe check-then-write flows
- Business-key duplicate checks for the identified high-risk flows
- Regression and architecture guardrails

Excluded:
- New class hierarchy or inheritance framework
- Generic repositories / DAO abstraction
- Rewriting all services to callbacks when the mutation is simple
- Changing product features or adding new business workflows
- Attendance source sync, event payment auto-match, or other previously deferred features
- Schema migration to a non-Sheets database

## 3. Common API Contract

All authenticated business APIs use `apiHandler_()`.

Target declaration:

```js
apiHandler_({
  operation: 'updateEvent',
  requireLogin: true,
  access: {
    domain: 'event',
    action: 'edit',
    screenId: 'optional-explicit-screen-id'
  },
  parse: parseEventRequest_,
  service: function (parsed, context) {
    return updateEventData_(parsed.request, context);
  }
});
```

Action meanings are fixed system-wide:

| API intent | Required action |
|---|---|
| Read/list/detail | `view` |
| Create/update/delete | `edit` |
| Approve/reject/confirm/process state | `approve` |
| Export/download generated business data | `export` |
| Administrator | bypass |

`requireLogin` remains explicit. `access` does not replace authentication.

## 4. Domain Override Model

There is no class inheritance. "Override" means a domain supplies policy through small resolver functions.

Core owns invocation only:

```js
resolveApiAccess_(context, access)
```

IAM owns the primitive permission check:

```js
requirePermission_(context, { screenId, action })
```

Each domain owns how a domain/action maps to the correct screen node.

Examples:

```js
resolveEventAccess_(access)
resolveAccountingAccess_(access)
resolveStudentFeeAccess_(access)
```

Each resolver returns:

```js
{ screenId: '...', action: 'edit' }
```

If `access.screenId` is explicitly supplied, the domain resolver may accept that value after validating that it belongs to the domain. Core must not know Event, Accounting, or Student Fee screen IDs.

Unknown domain, unknown action, or unresolved screen ID is fail-closed with `FORBIDDEN` or configuration error; it must never silently permit access.

## 5. Core Boundary

### `api_handler.gs`

Responsibilities:
1. Build login context when `requireLogin` is true.
2. Resolve and enforce `access` when provided.
3. Preserve legacy `permission` support during migration.
4. Parse input.
5. Invoke service.
6. Preserve current error propagation/logging behavior.

Migration precedence:
- `access` is the preferred contract.
- Existing `permission` remains temporarily supported.
- An API must not declare both `access` and `permission`.

Core must not contain domain-name-to-screen-ID tables.

### New `api_access.gs`

Responsibilities:
- Validate supported actions: `view`, `edit`, `approve`, `export`.
- Dispatch to the domain resolver.
- Call existing `requirePermission_()` with the resolved `{screenId, action}`.

This file is technical orchestration only.

## 6. Domain Access Ownership

### Event

`050_event/050_common/event_access.gs`

Owns Event screen/action mapping and Event access resolution.

The existing Forms-specific `requireEventEditContext_()` becomes a compatibility wrapper or is removed after all Event APIs use the common `access` contract. It must not remain a second authorization model.

### Accounting

Create `060_accounting/060_common/accounting_access.gs`.

Owns mappings for ledger, reconciliation/evidence, and settlement screens. Mutations that approve/process accounting state require `approve`; ordinary edits require `edit`.

### Student Fee

Create `080_student_fee/080_common/student_fee_access.gs`.

Owns mappings for payer, payment/application, and refund screens. Approval, rejection, payment confirmation, refund approval/rejection, and refund confirmation require `approve`.

## 7. Mutation Lifecycle Contract

Use a small function-style template, not a framework hierarchy.

Target interface:

```js
runMutation_({
  lock: true,
  loadCurrent: function () { ... },
  validate: function (current) { ... },
  execute: function (current) { ... },
  audit: function (result, current) { ... }
});
```

Rules:
- `lock` defaults to `true` for OperationDB mutation helpers that rely on check-then-write.
- `loadCurrent` runs inside the lock when `lock` is true.
- `validate` runs after re-read and before any write.
- `execute` performs domain writes.
- `audit` runs only after successful writes.
- The runner does not provide rollback. Multi-table services must therefore pre-validate all predictable failures before the first write.
- The runner is optional. Simple single-row updates may use `withOperationWriteLock_()` directly if doing so is clearer.

External I/O must remain outside the write lock whenever possible:

```text
external read
→ normalize/parse
→ write lock
→ re-read internal state
→ validate
→ write
→ audit
```

## 8. Concurrency and Partial-Write Rules

For any mutation that checks for absence before inserting, the absence check must occur inside the same write lock as the insert.

Required fixes:
- Student Fee application approval: re-read application and existing payment inside lock.
- Student Fee refund approval: re-read request and existing refund inside lock.
- Event Forms first-time `eventForms` upsert: re-read form row inside lock.

Batch operations must use two phases inside one lock:
1. Validate every requested item and derive all mutation plans.
2. Perform writes only after all items have passed predictable validation.

This prevents `ids.map()` from committing the first N items and then failing on item N+1.

## 9. State Transition Consistency

`processedAt` means "the time the business item was processed", regardless of outcome.

Therefore:
- approval → set `processedAt = now`
- rejection → set `processedAt = now`
- returning an item to an unprocessed state, if such a workflow is added later → clear `processedAt`

A rejected Event applicant must no longer clear `processedAt`.

Status transitions must be validated against current state after re-read. The service, not the frontend, is authoritative.

## 10. Money and Type Validation

All server-side monetary mutations must reject invalid numeric states before write.

Required baseline:
- amount must be finite
- amount must be greater than or equal to zero unless the domain explicitly models signed values
- ledger transaction amount must be strictly greater than zero
- transaction type must be exactly one of `수입`, `지출` after trim/normalization
- invalid values must fail instead of coercing to `0` or accidentally flipping type

### Ledger `balanceAfter`

`balanceAfter` must not be treated as an independent client-authored truth.

For this hardening pass:
- summary/settlement/event balances continue to derive from transaction amounts.
- create/update must not rely on client `balance_after` for any business decision.
- if persisted for display compatibility, it is treated as informational and normalized; no aggregate may use it as authoritative.

A later feature may replace it with a server-derived running balance, but that is outside this scope.

## 11. Business-Key Integrity

The Sheets schema supports primary keys and foreign keys but not database-enforced unique secondary keys. High-risk uniqueness must therefore be enforced in services and integrity checks.

Target business keys:
- `eventForms.eventId` → at most one row per event
- `feePayments.applicationId` → at most one payment per fee application
- `feeRefunds.requestId` → at most one refund per refund request
- `eventApplications.sourceResponseId` → duplicate protection within one source response identity

Integrity verifiers should report existing duplicates instead of silently choosing an arbitrary row.

### Event Forms fallback identity

The current content-snapshot hash is not a perfect response identity. This hardening pass changes fallback identity to stable identity fields when available:

```text
responseSheetId + sheetId + sourceResponseAt + studentId
```

If timestamp is unavailable, fall back to the current full-row hash. This reduces duplicate imports caused by editing non-identity answer fields while retaining a deterministic fallback.

Explicit source response ID always has highest priority.

## 12. Menu / Domain Access Semantics

The domain page-access map remains a coarse navigation gate; API authorization is authoritative.

`menu` must not be forced true merely because an unrelated action exists. Effective menu visibility should derive from any usable screen grant (`view`, `edit`, `approve`, `export`) without mutating the semantic meaning of the `menu` bit.

Migration requirement:
- stop setting `menu: true` unconditionally when constructing a role permission grant.
- preserve navigation visibility by computing menu presence from usable grants in `buildMenusFromPermissions_()`.

This avoids conflating "permission exists" with a distinct menu action while preserving current UX.

## 13. API Migration Matrix

### Event
- list/detail/edit-load reads → `view`
- create/update → `edit`
- status change/close → `approve`
- applicant list/detail → `view`
- applicant approve/reject/process → `approve`
- Forms sync → `edit`
- attendance list → `view`
- attendance mutation → `edit`
- refund reads → `view`

### Accounting
- ledger/reconciliation/settlement reads → `view`
- create/update/delete ledger, evidence upload/remove, bank source import → `edit`
- ledger process/match confirmation → `approve`
- settlement generation → `approve`
- exports → `export`

### Student Fee
- summary/reference/list/detail/calculation reads → `view`
- payer ordinary edits/imports → `edit`
- fee application approve/reject → `approve`
- payment confirmation → `approve`
- refund request approve/reject → `approve`
- refund transfer confirmation → `approve`
- exports, if present → `export`

## 14. Error Handling

Authorization failures:
- code: `FORBIDDEN`
- no fallback to login page at API level

Validation failures:
- keep existing domain error conventions where already established
- invalid access declaration is treated as configuration failure and must fail closed

Batch validation must identify the failing item before writes begin.

## 15. Testing Strategy

Add focused tests for:
1. `apiHandler_` access contract and legacy permission compatibility.
2. Domain access resolvers and admin bypass.
3. Read/edit/approve/export policy matrix.
4. Unauthorized direct API calls for Event, Accounting, and Student Fee.
5. Student Fee concurrent/check-then-insert protection using lock-bound re-read behavior.
6. Batch pre-validation preventing partial writes.
7. Event Forms upsert re-read inside lock.
8. Event rejected applicant `processedAt` semantics.
9. Ledger transaction type and numeric validation.
10. Business-key integrity duplicate reporting.
11. Menu semantics after removing forced `menu=true`.
12. Existing full regression suites and all architecture verifiers.

## 16. Architecture Guardrails

Add a verifier that fails when:
- business mutation APIs use only `requireLogin` without `access`/legacy `permission`
- Core contains hard-coded Event/Accounting/Student Fee screen IDs
- domain access files read/write sheets directly
- new generic repository/class/DI infrastructure is introduced
- high-risk Student Fee check-then-insert flows occur outside write lock
- Event Forms upsert uses a stale pre-lock `existingForm` decision

## 17. Rollout Order

1. Add common API access contract with backward compatibility.
2. Add domain access resolvers.
3. Migrate Event APIs and remove Forms-specific authorization duplication.
4. Migrate Accounting APIs.
5. Migrate Student Fee APIs.
6. Harden Student Fee concurrency and batch atomicity-by-prevalidation.
7. Harden Event Forms identity/upsert and Event processed timestamps.
8. Harden Accounting money/type validation.
9. Correct menu semantics.
10. Add business-key integrity checks and full regression guardrails.

Each step must preserve public API names and frontend contracts.

## 18. Non-Goals and YAGNI Rules

Do not add:
- classes
- dependency injection containers
- command buses
- strategy/factory class hierarchies
- generic CRUD repositories
- global domain registries containing business screen mappings
- rollback emulation across Sheets

The intended abstraction ceiling is small declarative config plus function callbacks.
