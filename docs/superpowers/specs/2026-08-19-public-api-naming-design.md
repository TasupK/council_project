# Public API Naming Design — Resource-oriented RPC

## Context

The application runs as a Google Apps Script web app and its frontend primarily calls server functions through `google.script.run`. The public server surface is therefore RPC, not a true HTTP REST API.

This design adopts the useful parts of REST — resource-oriented naming, singular/plural semantics, CRUD vocabulary, and explicit business commands — without introducing an HTTP router, `doGet`/`doPost` resource routing, status-code plumbing, or REST transport infrastructure.

The result is a **REST-inspired Resource-oriented RPC contract**.

## Goals

- Make every public API name understandable from its identifier alone.
- Make collection vs single-resource queries obvious through plural/singular resource names.
- Make resource ownership explicit in Apps Script's global function namespace.
- Prefer CRUD verbs for ordinary resource operations.
- Preserve explicit business commands when CRUD would hide domain intent.
- Remove technical/output-oriented suffixes such as `List`, `Detail`, and `Data` from public API names where singular/plural resource naming expresses the same distinction.
- Remove vague public verbs such as `load`, `save`, `run`, and `generate` when a more precise resource or command verb exists.
- Keep the existing `google.script.run` architecture and `apiHandler_` execution contract.

## Non-goals

- Convert the application into a true REST HTTP service.
- Replace `google.script.run` with `fetch` or external HTTP clients.
- Introduce URL routing, HTTP method routing, HTTP status-code mapping, or resource controllers.
- Change request/response schemas solely for naming consistency.
- Change authorization, locks, persistence, business rules, or state transitions.
- Rename internal private functions as part of this work; those follow the separate internal naming contract.

## Public API grammar

All standard public RPC functions use:

```text
api_<Verb><Resource>
```

For nested resources, the resource name includes the parent resource/domain context:

```text
api_<Verb><ParentResource><ChildResource>
```

Examples:

```text
api_getEvents
api_getEvent
api_createEvent
api_updateEvent

api_getEventApplicants
api_getEventApplicant
api_processEventApplicant

api_getStudentFeeApplications
api_getStudentFeeApplication
api_processStudentFeeApplications
```

`api_` remains the public Apps Script RPC marker.

## Resource naming

### Collection vs single resource

Collection and single-resource queries are distinguished by grammatical number instead of technical suffixes.

```text
api_getEvents        // collection
api_getEvent         // single resource

api_getLedgerEntries // collection
api_getLedgerEntry   // single resource
```

Public API names should not use `List` or `Detail` when singular/plural naming communicates the same distinction.

Preferred:

```text
api_getEventApplicants
api_getEventApplicant
```

Avoid:

```text
api_getEventApplicantList
api_getEventApplicantDetail
```

### Parent resource/domain context

Nested or subordinate resources always include their parent resource/domain in the public name because Apps Script functions share a global namespace.

Preferred:

```text
api_getEventApplicants
api_getEventAttendances
api_getEventRefunds

api_getStudentFeePayers
api_getStudentFeeApplications
api_getStudentFeeRefundRequests
```

Avoid:

```text
api_getApplicants
api_getAttendanceList
api_getFeePayerList
```

Root resources do not repeat redundant domain words.

Examples:

```text
api_getEvents
api_getLedgerEntries
api_getReconciliations
api_getSettlementReports
```

## CRUD verbs

Ordinary resource lifecycle operations use this vocabulary:

- `get` — read a collection or resource.
- `create` — create a persisted domain resource.
- `update` — modify an existing resource without implying a special business workflow.
- `delete` — delete or perform the domain's established delete semantics for a resource.

Examples:

```text
api_getEvents
api_getEvent
api_createEvent
api_updateEvent

api_getLedgerEntries
api_getLedgerEntry
api_createLedgerEntry
api_updateLedgerEntry
api_deleteLedgerEntry

api_createLedgerDraft
api_createSettlementReport
```

A resource that is stored as a domain record should generally use `create`, not `generate` or `save`.

## Business command verbs

CRUD is not forced onto operations whose main meaning is a domain command. These verbs are allowed when they communicate business intent better than generic update semantics.

### `process`

Use for approval/rejection workflows or multi-step business-state processing.

```text
api_processEventApplicant
api_processStudentFeeApplications
api_processStudentFeeRefundRequests
api_processReconciliation
```

Do not use `process` as a generic synonym for save/update.

### `confirm`

Use when confirming an external or financial fact.

```text
api_confirmStudentFeePayment
api_confirmStudentFeeRefund
```

### `apply`

Use when applying an explicit set/batch of supplied changes.

```text
api_applyEventAttendanceChanges
api_applyReconciliationLink
```

### `sync`

Use for synchronization with an external source/system.

```text
api_syncEventApplicantsFromForms
```

### `calculate`

Use for deterministic calculation that does not represent resource persistence.

```text
api_calculateStudentFeeAmount
api_calculateStudentFeeRefund
```

### `export`

Use when exporting a resource/report to an external representation or downloadable form.

```text
api_exportSettlementReport
```

## Disallowed or discouraged public verbs

The following verbs are not part of the default public API vocabulary:

- `load` — use `get` for reads.
- `save` — use `create`, `update`, or a specific business command.
- `run` — use the domain command (`process`, `calculate`, `sync`, etc.).
- `generate` — use `create` for persisted resources; reserve specialized generation only if a future API creates a transient artifact and no better verb applies.

Examples:

```text
api_saveLedgerDraft
→ api_createLedgerDraft

api_runReconciliation
→ api_processReconciliation

api_generateSettlementReport
→ api_createSettlementReport
```

## Public output-oriented suffixes

### `List` / `Detail`

Do not use these for ordinary collection/single-resource distinction. Use plural/singular resources instead.

```text
api_getEventList
→ api_getEvents

api_getEventDetail
→ api_getEvent
```

### `Data`

Do not use `Data` merely because an API returns data.

```text
api_getStudentFeeReferenceData
→ api_getStudentFeeReference
```

`Data_` remains meaningful for internal application-service functions under the separate internal naming contract; it is intentionally not part of the public API vocabulary.

### Semantic query nouns remain valid

Names such as `Summary`, `Reference`, `Options`, and `Content` may remain when they represent a meaningful resource/view rather than a generic output shape.

Examples:

```text
api_getStudentFeeSummary
api_getStudentFeeReference
api_getLedgerEventOptions
api_getEvidenceFileContent
```

## Representative target naming

### Event

```text
api_getEvents
api_getEvent
api_createEvent
api_updateEvent
api_updateEventStatus
api_closeEvent

api_getEventApplicants
api_getEventApplicant
api_processEventApplicant
api_syncEventApplicantsFromForms

api_getEventAttendances
api_applyEventAttendanceChanges

api_getEventRefunds
```

`updateEventStatus` / `closeEvent` may remain business-specific commands if implementation review confirms they are clearer than modeling them as generic `updateEvent`. The migration map must decide these based on current semantics rather than renaming mechanically.

### Accounting

```text
api_getLedgerEntries
api_getLedgerEntry
api_getLedgerSummary
api_getLedgerEventOptions
api_createLedgerEntry
api_createLedgerDraft
api_updateLedgerEntry
api_deleteLedgerEntry
api_processLedgerEntry

api_getReconciliations
api_getReconciliation
api_getReconciliationCandidates
api_processReconciliation
api_applyReconciliationLink
api_createLedgerEntryFromReconciliation

api_getSettlementSummary
api_getSettlementReports
api_getSettlementReport
api_createSettlementReport
api_exportSettlementReport
```

### Student Fee

```text
api_getStudentFeeReference
api_getStudentFeeSummary

api_getStudentFeePayers
api_getStudentFeePayer
api_createStudentFeePayer
api_updateStudentFeePayer

api_getStudentFeeApplications
api_getStudentFeeApplication
api_processStudentFeeApplications
api_calculateStudentFeeAmount
api_confirmStudentFeePayment

api_getStudentFeeRefundRequests
api_getStudentFeeRefundRequest
api_processStudentFeeRefundRequests
api_calculateStudentFeeRefund
api_confirmStudentFeeRefund
```

## Settings public bridge

Settings currently exposes public bridge functions outside the `api_*` convention:

```text
loadSettingsHomeData
loadSettingsUsersData
saveSettingsUserDepartment
loadSettingsRolesData
loadSettingsPermissionsData
loadSettingsDepartmentsData
```

These should eventually join the same public naming contract:

```text
api_getSettingsHome
api_getSettingsUsers
api_updateSettingsUserDepartment
api_getSettingsRoles
api_getSettingsPermissions
api_getSettingsDepartments
```

Because these functions are direct frontend bridge contracts, migrate them in the final batch after all ordinary `api_*` callers have been converted and verified.

## Compatibility strategy

The preferred migration strategy is **atomic caller migration without permanent aliases**.

For each batch:

1. Rename the public server function.
2. Update every repository caller in the same change — frontend, tests, architecture verifiers, docs, and any script references.
3. Verify no legacy public symbol remains.
4. Do not retain deprecated aliases unless implementation review discovers a documented external consumer outside this repository.

This project primarily consumes these RPC functions from its own Apps Script frontend, so permanent compatibility aliases would increase surface area and make incomplete migrations harder to detect.

## Migration order

1. **Resource shape migration**
   - `List`/`Detail` → plural/singular resource names.
   - Add parent resource/domain names to nested resources.
   - Remove generic `Data` suffixes.

2. **Verb normalization**
   - `save` → `create`/`update`.
   - `run` → specific business command.
   - `generate` → `create` for persisted domain resources.
   - Preserve precise domain commands where appropriate.

3. **Settings bridge migration**
   - `loadSettings*` / `saveSettings*` → standard `api_*` names.

4. **Guardrail**
   - Add a public API naming verifier that rejects legacy names, banned generic verbs, and collection APIs that use `List` instead of plural resources, with explicit allowlists only for justified exceptions.

## Verification requirements

Each migration batch must verify:

- all public API definitions and repository call sites use the target name;
- no legacy symbol remains in server/frontend/tests/verifiers;
- request and response shapes are unchanged;
- all existing behavior tests pass;
- all architecture verifiers pass;
- the new public API naming verifier passes.

Final verification must run every `scripts/test-*.js` and every `scripts/verify-*.js`.

## Success criteria

- Public API naming is resource-oriented and readable without implementation context.
- Collection vs single-resource reads use plural/singular names instead of `List`/`Detail`.
- Nested resources always include parent/domain context.
- Standard CRUD uses `get/create/update/delete`.
- Business commands use a small, explicit vocabulary (`process`, `confirm`, `apply`, `sync`, `calculate`, `export`).
- `load/save/run/generate` and generic public `Data` suffixes are removed unless explicitly justified.
- Settings public bridges follow the same `api_*` convention.
- The Apps Script RPC architecture remains unchanged.
