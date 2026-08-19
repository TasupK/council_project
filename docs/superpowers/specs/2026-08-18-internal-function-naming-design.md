# Internal Function Naming Consistency Design

## Context

The repository now has clearer domain and API boundaries, but internal function names still mix verbs such as `get`, `load`, `find`, `read`, `build`, `resolve`, `process`, `apply`, and `confirm` without a consistently enforced semantic boundary. This makes it harder to infer whether a function performs a query, persistence read, mutation, pure transformation, validation, or authorization.

This work standardizes **internal function names only**. Public `api_*` names remain unchanged and will be handled separately later.

## Goals

- Make the leading verb communicate responsibility and side effects.
- Preserve behavior and public contracts.
- Preserve current architecture: API → service/query → DAO/reader/mapper.
- Avoid layer prefixes such as `queryGet*`, `daoFind*`, or class-style abstractions.
- Add an automated guardrail so new internal functions follow the convention.

## Non-goals

- Rename public `api_*` functions.
- Rename GAS entry points such as `doGet` / `doPost` if present.
- Change business logic, request/response shapes, Sheet schemas, routes, or frontend contracts.
- Introduce classes, generic repositories, DI, or a naming framework.
- Rename functions merely for stylistic preference when the current name already matches its responsibility.

## Naming contract

All project-private server helpers continue to use a trailing underscore `_` unless they are intentionally public GAS/API entry points.

### Query and persistence

- `get*Data_`: query-service function returning a complete UI/API-facing domain result or view model.
  - Examples: `getEventListData_`, `getEventDetailData_`, `getStudentFeeSummaryData_`.
- `find*`: DAO or repository-adjacent lookup returning one row/object or nullable result.
  - Examples: `findEventRowById_`, `findFeePaymentRowByApplicationId_`.
- `list*`: DAO-level collection read returning raw/domain rows without building a final view model.
  - Preferred over `findAll*` for simple collection reads.
- `read*`: external or low-level source read where the source itself matters (Spreadsheet, Form, file, raw table source).
  - Examples: `readEventFormResponseSource_`, `readOperationTableRows_`.

### Mutations

- `create*Data_`: create a new domain object/record through business rules.
- `update*Data_`: update an existing domain object through business rules.
- `delete*Data_`: delete a domain object through business rules.
- `process*Data_`: approval/rejection or a multi-step business-state transition.
- `confirm*Data_`: confirm an external fact or final money/state fact, such as deposit/refund confirmation.
- `apply*Data_`: apply a supplied change set or batch of explicit changes.
- DAO persistence primitives keep concrete verbs such as `insert*Row_`, `update*RowById_`, and `delete*RowById_` when they directly map to persistence operations.

`process*` must not be used as a generic synonym for `save`, `update`, or `execute`.

### Pure transformations and decisions

- `build*`: construct a DTO/index/tree/payload from existing data without external persistence side effects.
- `map*`: transform one representation into another representation.
- `resolve*`: choose/derive one effective value, reference, policy, configuration, source, or candidate from multiple possibilities.
- `parse*`: raw/request text or input → normalized typed/request representation.
- `normalize*`: normalize representation without changing domain meaning.
- `calculate*`: deterministic calculation.

### Guards and predicates

- `validate*`: perform validation and return validation information/boolean; should not be used when the primary contract is throwing.
- `assert*`: enforce a domain invariant and throw when invalid.
- `require*`: enforce required authentication, authorization, context, or required presence and throw when missing.
- `is*`, `has*`, `can*`: boolean predicates.

### Explicit writes

- `write*`: explicit append/write semantics such as audit/log/history writing, where `create*Data_` would incorrectly imply domain-entity creation.

## `Data_` suffix contract

`Data_` communicates a domain/application service boundary, not merely “returns data.”

Use `Data_` for:
- query-service functions returning final application/UI-facing results;
- domain mutation-service functions implementing business commands.

Do not use `Data_` for:
- DAOs and raw persistence helpers;
- readers;
- mappers/builders/resolvers;
- normalization/parsing/validation utilities;
- permission helpers.

Examples:

```js
getEventDetailData_()
createEventData_()
processApplicantData_()

findEventRowById_()
listEventRows_()
buildEventFormCandidates_()
resolveEventAccess_()
normalizeEventText_()
```

## Rename policy

This is a **symbol-only refactor**. Every renamed function must preserve its parameters, return value, side effects, errors, lock behavior, and call ordering.

Rename candidates are selected when one or more of these are true:

1. The current verb conflicts with the responsibility contract above.
2. Equivalent functions in the same layer use different verbs for the same operation.
3. A name hides a relevant semantic distinction, e.g. final query result vs raw DAO read.
4. `process*` is used for an operation better described by `create`, `update`, `confirm`, `apply`, `build`, or `resolve`.
5. `findAll*` is a raw collection DAO read and can be consistently expressed as `list*`.

Do not rename when the existing name already satisfies the convention.

## Scope order

Rename in small, testable batches:

1. Core / Schema / Auth / IAM internal helpers.
2. Event internal helpers.
3. Accounting internal helpers.
4. Student Fee internal helpers.
5. Settings and frontend-included server helpers if applicable.

Public `api_*` names are explicitly excluded from all batches.

## Compatibility

Because GAS resolves global functions by name, renames must update every repository reference atomically within each batch: production code, tests, and architecture verifiers.

No temporary compatibility aliases should remain after a batch unless a function is called externally by GAS or a documented integration. Internal aliases would hide incomplete migration and weaken the guardrail.

## Guardrail

Add `scripts/verify-function-naming.js`.

The verifier should inspect declared server-side functions and enforce only high-confidence structural rules rather than trying to infer all business semantics automatically.

It should fail when:

- an internal project function lacks the trailing `_` unless explicitly allowlisted as a GAS/public entry point;
- a public `api_*` function is accidentally renamed or gets a trailing `_` as part of this work;
- new private functions use clearly banned vague prefixes such as `handle*`, `do*`, `execute*`, or generic `process*` patterns in locations where the naming contract provides an established alternative;
- a DAO/raw-row helper newly uses `get*Data_`;
- known old renamed symbols remain referenced after migration.

The verifier should use a small explicit allowlist for platform entry points and existing intentional exceptions. It must not become a complex static-analysis framework.

## Verification

Each rename batch must run:

- targeted behavior tests for the affected domain;
- affected architecture verifiers;
- `node scripts/verify-function-naming.js`;

Final verification must run every `scripts/test-*.js` and every `scripts/verify-*.js`.

## Success criteria

- Public `api_*` functions are unchanged.
- Internal function verbs consistently express layer/side-effect semantics.
- `Data_` is limited to application/query/domain-service boundaries.
- Raw collection DAO reads consistently prefer `list*` over `findAll*` where safe.
- All symbol references are updated; no compatibility aliases remain unnecessarily.
- Full regression and architecture verification pass.
- Naming guardrail passes and remains in the repository.
