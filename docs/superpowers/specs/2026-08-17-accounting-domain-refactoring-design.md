# Accounting Domain Refactoring Design

## Goal

Refactor `src/000_server/060_accounting` around the actual Accounting responsibilities and the current DB specification, while preserving existing public API behavior during the structural refactor.

The Accounting domain is responsible for:

1. Ledger management
2. Evidence management
3. Reconciliation
4. Audit export

The database specification `학생회_DB명세서_2026` is the source of truth for persisted Accounting data structures.

---

## Domain Model

### 1. Ledger

**Purpose:** Manage the original accounting transaction ledger.

**DB:** `FIN_01_LEDGER` / 수입지출원장

Responsibilities:
- list and detail lookup
- create transactions
- update transactions
- change matching/status information
- represent both bank-imported and manually-created transactions

The Ledger is the authoritative transaction record. Bank-imported transactions are not modeled as a separate domain table; they are Ledger rows identified by source such as `은행가져오기`.

### 2. Evidence

**Purpose:** Manage evidence attached to individual Ledger transactions.

**DB:** `FIN_02_EVIDENCE` / 거래증빙

Responsibilities:
- register evidence metadata
- attach evidence to a Ledger transaction
- manage representative and additional evidence
- save/read related Drive files

Evidence owns the lifecycle of transaction-level evidence. It does not own audit-period reconciliation state.

### 3. Reconciliation

**Purpose:** Manage reconciliation results for a defined audit period.

**DB:** `FIN_03_RECONCILIATION` / 감사대사

Responsibilities:
- compare Ledger, account-history-derived transaction state, and Evidence completeness
- calculate missing, excess, mismatched, and insufficient-evidence counts
- preserve audit-period reconciliation results
- manage reconciliation status, reviewer, confirmation timestamp, and notes

Reconciliation is period-based and has a different lifecycle from individual Evidence records.

Reconciliation must not mutate original Ledger or Evidence records as a side effect of calculating a result.

### 4. Audit Export

**Purpose:** Generate materials used for audit preparation and submission.

**DB:** none initially

Responsibilities:
- read Ledger data
- read Evidence data
- read Reconciliation results
- compose audit-facing datasets and files
- export to supported formats when implemented

Audit Export is initially a stateless service. It does not have its own DAO or persistence table. Export history is out of scope until a concrete requirement appears.

---

## Target Structure

```text
src/000_server/060_accounting/
├─ 060_common/
│  ├─ accounting_common.gs
│  ├─ accounting_query_service.gs
│  └─ accounting_event_read_dao.gs
│
├─ 061_ledger/
│  ├─ ledger_api.gs
│  ├─ ledger_service.gs
│  ├─ ledger_validator.gs
│  └─ ledger_sheet_dao.gs
│
├─ 062_evidence/
│  ├─ evidence_api.gs
│  ├─ evidence_service.gs
│  ├─ evidence_validator.gs
│  ├─ evidence_sheet_dao.gs
│  └─ evidence_file_service.gs
│
├─ 063_reconciliation/
│  ├─ reconciliation_api.gs
│  ├─ reconciliation_service.gs
│  ├─ reconciliation_validator.gs
│  └─ reconciliation_sheet_dao.gs
│
└─ 064_audit_export/
   ├─ audit_export_api.gs
   └─ audit_export_service.gs
```

Do not create empty files only to satisfy symmetry. A Validator, API, or Service file exists only when concrete responsibilities are present.

---

## Common Layer

`060_common` contains only Accounting-wide primitives and read composition that genuinely spans multiple Accounting features.

### `accounting_common.gs`

Allowed responsibilities:
- primitive conversions
- shared formatting helpers
- ID generation helpers if genuinely Accounting-wide
- small stateless helpers used by multiple Accounting features

It must not own Ledger/Evidence/Reconciliation business rules.

### `accounting_query_service.gs`

Read-only composition for screen/view models that span multiple features.

Examples:
- Ledger rows enriched with Event names
- Ledger rows enriched with Evidence lists
- current income/expense/balance summary
- current Accounting dashboard summary

Rules:
- read only
- no locks
- no insert/update/delete
- no Drive uploads
- no hidden mutation side effects

### `accounting_event_read_dao.gs`

Accounting-owned read-only adapter for Event reference data.

Allowed:
- read Event rows required by Accounting

Forbidden:
- insert Event
- update Event
- delete Event
- call Event mutation services

Accounting must not depend directly on `050_event` internal DAOs.

---

## Feature Boundaries

### API

Public `api_*` functions remain thin adapters around `apiHandler_`.

They may:
- parse/forward input
- select the correct Service or Query Service
- preserve current public API names and response contracts

They must not contain substantial domain logic.

### Service

Owns feature-specific mutation and business rules.

Examples:
- Ledger create/update/process
- Evidence metadata registration
- Reconciliation creation/confirmation
- Audit export composition/file generation

### Validator

Owns non-trivial feature validation and normalization when such logic exists.

Do not create validators for trivial one-line checks.

### Sheet DAO

Owns persistence access to one feature's table.

- `ledger_sheet_dao.gs` -> `FIN_01_LEDGER`
- `evidence_sheet_dao.gs` -> `FIN_02_EVIDENCE`
- `reconciliation_sheet_dao.gs` -> `FIN_03_RECONCILIATION`

DAOs do not build screen DTOs or contain business rules.

### File Service

`evidence_file_service.gs` owns Drive-specific Evidence file behavior.

Examples:
- filename sanitization
- folder lookup/creation
- base64 decoding
- Drive file creation/read

Evidence business metadata remains in `evidence_service.gs`.

---

## Dependency Direction

```text
Ledger API
  -> Ledger Service
  -> Ledger DAO

Evidence API
  -> Evidence Service
      -> Evidence DAO
      -> Evidence File Service

Reconciliation API
  -> Reconciliation Service
      -> Reconciliation DAO
      -> Ledger read functions
      -> Evidence read functions

Audit Export API
  -> Audit Export Service
      -> Ledger read functions
      -> Evidence read functions
      -> Reconciliation read functions

Accounting Query Service
  -> Ledger DAO
  -> Evidence DAO
  -> Accounting Event Read DAO
```

Feature Services must not form bidirectional dependencies.

Audit Export and Query Service are read-oriented consumers of persisted feature data and must not mutate source records.

---

## Current Code Interpretation

### `ledger.gs`

Current public Ledger APIs belong in `061_ledger/ledger_api.gs`.

Business logic currently embedded in API functions should move to Ledger Service or Accounting Query Service while public API names remain unchanged.

### `accounting_service.gs`

This file currently mixes:
- Ledger mutation
- cross-feature Ledger query composition
- DTO transformation
- filtering
- shared helpers

It must be decomposed by responsibility rather than preserved as a generic Accounting service.

### `accounting_sheet_dao.gs`

This currently accesses Ledger, Evidence, and Event tables in one DAO.

It must split into:
- Ledger DAO
- Evidence DAO
- Accounting Event Read DAO

Reconciliation DAO is added when concrete `FIN_03_RECONCILIATION` persistence operations are implemented.

### `evidence.gs`

This currently mixes public API, Evidence metadata persistence orchestration, and Drive I/O.

It should split into:
- Evidence API
- Evidence Service
- Evidence File Service
- Evidence DAO

### `settlement.gs`

`Settlement` is not a persisted Accounting domain in the current DB specification.

The existing `api_getSettlementSummary()` public API must remain compatible during refactoring, but its current summary calculation belongs to Accounting read composition rather than a Settlement domain.

The internal `settlement` concept should therefore not become a standalone persisted feature.

### Audit Export

Audit Export replaces the conceptual role previously attributed to Settlement for future audit-preparation output. It remains stateless until an export-history requirement is explicitly introduced.

---

## DB-to-Code Mapping

| DB specification | Code feature |
|---|---|
| `FIN_01_LEDGER` | `061_ledger` |
| `FIN_02_EVIDENCE` | `062_evidence` |
| `FIN_03_RECONCILIATION` | `063_reconciliation` |
| no persistence table | `064_audit_export` |
| `EVT_01_EVENT` reference | `060_common/accounting_event_read_dao.gs` read-only |

---

## Compatibility Constraints

The first implementation phase is structural refactoring, not feature expansion.

Must preserve:
- existing public API function names
- input shapes
- output shapes
- error behavior unless an existing bug is explicitly addressed later
- current ID generation behavior
- Drive folder/file behavior
- current default values
- existing TODO behavior

Do not add missing Reconciliation or Export features during the structural refactor unless separately specified.

Do not rename existing public `api_getSettlementSummary()` during the compatibility phase even though the internal Settlement domain is removed.

---

## Testing Strategy

Accounting should follow the Event reference implementation:

1. architecture verification
   - required feature paths exist
   - legacy godfiles are removed when fully migrated
   - functions have one clear owner
   - Event reference DAO is read-only

2. behavior regression tests
   - Ledger DTO/output behavior
   - Ledger filters
   - Ledger save/default behavior
   - Evidence metadata mapping
   - Evidence-to-Ledger composition
   - current settlement-summary API compatibility

3. later feature tests
   - Reconciliation calculations
   - Reconciliation history persistence
   - Audit Export output

The structural refactor must not be considered complete solely because files were moved; behavior regression tests are required.

---

## Non-Goals

This refactor does not:
- redesign the DB specification
- add a separate bank transaction table
- implement full reconciliation logic that does not exist yet
- implement export history persistence
- change client APIs
- introduce classes, dependency injection containers, generic repositories, ORM abstractions, or framework-like architecture

The design favors explicit Apps Script functions and feature-owned files.