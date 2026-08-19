# Event–Accounting Payment Contract Design

## Status

Approved architectural direction for the Event ↔ Accounting payment boundary.

## Goal

Keep Event payment handling and Accounting ledger handling separated while preserving traceability from an event application payment to the final bank-backed ledger transaction.

## Domain ownership

### Event domain

The Event domain owns the operational statement that an applicant has paid.

- `eventApplications.appliedFee` is the expected fee for the application.
- `eventPayments` is created only when a real payment is operationally confirmed by Event staff.
- Event records only business-facing payment facts.
- Event must not read, write, or reference Accounting `bankTransactions` directly.
- Event must not create, update, confirm, or invalidate Accounting `ledger` rows directly.

### Accounting domain

Accounting owns the financial truth and final ledger record.

- `bankTransactions` is the bank-originated cash fact.
- reconciliation owns the process that matches bank transactions to business-originated payment facts.
- `ledger` is the accounting-confirmed transaction record.
- Accounting may read Event payment data through an explicit integration/query boundary, but Event must not depend on Accounting internals.

## Canonical data meaning

### `eventApplications.appliedFee`

Meaning: expected amount to be paid for the event application.

This is the sole source of truth for the expected fee. `eventPayments.expectedAmount` is therefore redundant and should be removed from the target schema and runtime contract.

### `eventPayments`

Meaning: payment facts operationally confirmed by Event staff.

Target fields:

- `id` / 행사입금ID
- `applicationId` / 신청ID
- `paidAmount` / 실제입금액
- `paymentDate` / 입금일
- `depositorName` / 입금자명
- `moneyStatus` / 금전처리상태
- `managerEmail` / 담당자이메일
- `confirmedAt` / 확인일시

`eventPayments` must not contain:

- bank transaction ID
- ledger ID
- reconciliation ID
- any direct Accounting FK
- redundant expected amount

Expected amount for views is derived by joining `eventPayments.applicationId -> eventApplications.appliedFee`.

### `bankTransactions`

Meaning: bank-originated transaction fact imported by Accounting.

This data is authoritative for whether money actually moved through the managed bank account.

### `ledger`

Meaning: accounting-confirmed transaction.

When a ledger row is created from an Event payment, the canonical linkage is:

- `transactionType = 수입`
- `eventId = eventApplications.eventId`
- `businessType = EVENT_PAYMENT`
- `businessId = eventPayments.id`
- `source = BANK`
- `bankTransactionId = matched bankTransactions.id`

`businessId` is the cross-domain trace key back to the Event payment source.

## Lifecycle

### 1. Application

Event creates/imports an `eventApplications` row.

The expected fee is stored only in `eventApplications.appliedFee`.

No `eventPayments` row is created at application time.

### 2. Operational payment confirmation

When Event staff confirms a payment, Event creates an `eventPayments` row containing:

- application ID
- actual paid amount
- depositor name
- payment date
- money status
- manager email
- confirmed timestamp

This does not create a ledger row and does not require a bank transaction match.

### 3. Bank transaction import

Accounting imports `bankTransactions` independently from Event.

### 4. Reconciliation

Accounting reconciliation compares bank facts with business facts.

For Event income, reconciliation may use Event payment information such as:

- paid amount
- depositor name
- payment date
- event/application context

The match decision belongs to Accounting.

### 5. Ledger creation/link

After a bank transaction is matched to an Event payment, Accounting creates or links the ledger row using:

- `businessType = EVENT_PAYMENT`
- `businessId = eventPayment.id`
- the matched `bankTransactionId`
- the related `eventId`

The ledger is not considered bank-confirmed merely because Event marked a payment as received.

## State boundaries

`eventPayments.moneyStatus` represents Event operational processing state only. It must not be used as an alias for ledger match status or reconciliation result.

Accounting statuses remain independent:

- bank record status describes bank import validity
- reconciliation result describes comparison/matching outcome
- ledger match status describes ledger-to-bank consistency

Changing an Event payment status must not directly mutate Accounting status fields.

## Failure and correction rules

### Event correction before accounting linkage

Event may correct or invalidate its own payment record according to Event mutation rules and audit requirements.

No Accounting mutation is necessary if no ledger was created from that payment.

### Event correction after accounting linkage

If an Event payment already has a ledger with `businessType = EVENT_PAYMENT` and `businessId = eventPayment.id`, Event must not silently rewrite accounting history.

The correction must surface as an Accounting review/reconciliation concern. Accounting owns the ledger correction or invalidation action.

### Duplicate ledger protection

Accounting must prevent more than one active ledger row from claiming the same Event payment source unless a future explicit split-payment design is approved.

For the current contract:

- one `eventPayment.id` -> at most one active ledger row
- one bank transaction -> at most one active ledger row, preserving the existing ledger bank-claim invariant

## Payment cardinality

An application may have multiple Event payment rows if separate real deposits occur. The application-level paid amount remains the sum of `eventPayments.paidAmount`.

Each individual `eventPayments` row is independently reconcilable and independently traceable to a ledger row.

This keeps partial payments and multiple deposits representable without coupling the application itself to Accounting.

## Integration boundary

The preferred dependency direction is:

`Accounting -> Event payment read boundary`

not:

`Event -> Accounting internals`

Accounting reconciliation may call a narrow Event payment query/integration function that exposes normalized payment facts required for matching. It must not use Event sheet primitives directly outside the approved boundary.

Event mutation services never call Accounting ledger or reconciliation services.

## Auditing

Event payment creation/update/confirmation must write business audit entries with the Event actor.

Accounting reconciliation and ledger creation/linking continue to write Accounting audit entries with the Accounting actor.

The two audit trails remain separate and can be correlated through:

- Event payment ID
- ledger `businessType = EVENT_PAYMENT`
- ledger `businessId = eventPayment.id`

## Schema migration

The target `eventPayments` schema removes `expectedAmount` because `eventApplications.appliedFee` is authoritative.

Migration requirements:

- preserve all existing payment rows
- remove only the redundant expected-amount column after confirming no runtime code relies on it as a source of truth
- do not fabricate bank transaction or ledger references in Event data
- physical OperationDB migration must be backed up first
- code/schema contract must be GREEN before physical migration

## Non-goals

This design does not:

- make Event responsible for bank matching
- make Event responsible for ledger creation
- auto-confirm ledger transactions when Event confirms payment
- introduce Accounting foreign keys into `eventPayments`
- merge Event and Accounting audit trails
- redesign refunds or settlement in this phase

## Acceptance criteria

The implementation is complete when:

1. Event can create and update operational payment facts without importing Accounting modules.
2. `eventApplications.appliedFee` is the only expected-fee source of truth.
3. `eventPayments.expectedAmount` is removed from the canonical schema/runtime contract.
4. Event payment query behavior still supports application-level paid totals by summing real payment rows.
5. Accounting reconciliation can consume Event payment facts through an explicit read boundary.
6. Accounting can create/link a ledger row with `businessType = EVENT_PAYMENT` and `businessId = eventPayment.id`.
7. Duplicate active ledger claims for the same Event payment are rejected.
8. Event payment mutations and Accounting ledger/reconciliation mutations produce separate audit records.
9. No Event source file directly references `bankTransactions` or Accounting sheet primitives.
10. All Node regression tests and architecture/naming verifiers are GREEN before any physical OperationDB migration.
