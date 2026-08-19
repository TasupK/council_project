# Accounting DB v2 Design

## Goal

Rebuild the Accounting data model around six clear responsibilities while preserving existing business flows:

1. `계좌거래` — immutable bank-source facts imported from Toss Bank Excel transaction history.
2. `수입지출원장` — accounting source of truth managed by the student council.
3. `거래증빙` — evidence files attached to ledger entries; transaction-detail screenshots are evidence and may be OCR-assisted.
4. `감사대사` — user-triggered reconciliation run for an arbitrary date range.
5. `감사대사상세` — immutable snapshot of item-level reconciliation results for that run.
6. `결산보고서` — immutable settlement snapshot/export for an arbitrary date range.

`계좌OCR로그` is removed from the Accounting domain. OCR is an evidence-processing capability, not a bank-transaction ingestion table.

## Core Principles

- `수입지출원장` remains the accounting source of truth.
- `계좌거래` is an immutable representation of the bank's original transaction data.
- Bank transaction and ledger entry have a 1:1 final relationship.
- The relationship source of truth is `수입지출원장.계좌거래ID`.
- `계좌거래ID` is nullable while a manually entered ledger entry is waiting for a later bank match, but once present it must be unique.
- There are no cash transactions. Every valid final ledger entry is expected to match one bank transaction.
- Evidence belongs to a ledger entry, never directly to a bank transaction.
- Toss transaction-detail screenshots are evidence. OCR is used only to assist validation; the original Drive file is authoritative.
- Reconciliation does not create or own the bank↔ledger relationship. It reads the current relationship and stores a snapshot of validation results.
- Settlement does not lock ledger entries. A confirmed settlement remains unchanged even if the underlying ledger later changes; a new settlement is created when a new snapshot is needed.
- Existing data must not be destructively rewritten during migration without an explicit migration rule.

## 1. 계좌거래

### Purpose

Store one row for each transaction row in the actual Toss Bank Excel transaction history. Values are preserved as bank facts rather than translated into accounting terminology.

### Target Columns

| Column | Constraint | Meaning |
| --- | --- | --- |
| `계좌거래ID` | PK | Internal transaction identifier |
| `거래일시` | NOT NULL | Toss `거래 일시` |
| `적요` | NOT NULL | Toss `적요` |
| `거래유형` | NOT NULL | Toss original transaction type |
| `거래기관` | nullable | Toss `거래 기관` |
| `상대계좌번호` | nullable | Toss `계좌번호`, renamed for semantic clarity |
| `거래금액` | NOT NULL | Signed bank amount; deposits positive, withdrawals/card payments negative |
| `거래후잔액` | nullable | Toss `거래 후 잔액`; remain null if bank source is blank |
| `메모` | nullable | Toss `메모` |
| `원본해시` | UNIQUE, NOT NULL | Row-level duplicate prevention hash |
| `레코드상태` | NOT NULL | `정상` / `무효` |
| `등록일시` | NOT NULL | System ingestion timestamp |

### Source Hash

`원본해시` is produced from normalized values of:

`거래일시 | 적요 | 거래유형 | 거래기관 | 상대계좌번호 | 거래금액 | 거래후잔액 | 메모`

The purpose is transaction-level duplicate prevention. File-level import history is intentionally not modeled.

### Mutability

- Create: allowed.
- Update of source transaction values: prohibited.
- Delete: prohibited.
- Incorrect rows are invalidated with `레코드상태 = 무효` and re-imported correctly.

### Accounting Classification

`거래유형` preserves the original bank value such as `입금`, `출금`, `모임원송금`, `체크카드결제`, `이자입금`, or `프로모션입금`.

It is not replaced with `수입/지출`. Conversion to ledger semantics happens when a ledger entry is created or matched.

## 2. 수입지출원장

### Purpose

Store the student council's accounting interpretation of each transaction. This remains the source of truth for accounting queries, updates, reconciliation status, and settlement aggregation.

### Target Columns

| Column | Constraint | Meaning |
| --- | --- | --- |
| `거래ID` | PK | Ledger identifier |
| `계좌거래ID` | FK → `계좌거래.계좌거래ID`, nullable, UNIQUE | Final 1:1 bank link |
| `거래일시` | NOT NULL | Accounting transaction datetime |
| `거래내용` | NOT NULL | Internal business description |
| `거래구분` | NOT NULL | `수입` / `지출` |
| `거래금액` | NOT NULL, > 0 | Absolute accounting amount |
| `거래상대명` | nullable | Counterparty name used internally |
| `유입경로` | NOT NULL | `BANK` / `MANUAL` |
| `행사ID` | FK → `행사.행사ID`, nullable | Event association |
| `업무구분` | nullable | Originating business domain |
| `업무ID` | nullable | Originating business record ID |
| `일치상태` | NOT NULL | `미확인` / `정상` / `확인필요` |
| `레코드상태` | NOT NULL | `활성` / `무효` |
| `담당자ID` | FK → UserDB `사용자.Google이메일` | Responsible user |
| `등록일시` | NOT NULL | Created timestamp |
| `수정일시` | NOT NULL | Last modified timestamp |

### Lifecycle

#### Bank-first default flow

`Toss Excel → 계좌거래 → 수입지출원장`

When created from a bank transaction:

- `유입경로 = BANK`
- `계좌거래ID` is populated immediately.
- `거래구분` is derived from the signed amount / bank type.
- `거래금액` is stored as a positive absolute amount.

#### Manual-first exception flow

`수기 원장 → later bank import → 1:1 match`

When manually entered first:

- `유입경로 = MANUAL`
- `계좌거래ID = null`
- `일치상태 = 미확인`

Later, exactly one bank transaction may be linked. `유입경로` does not change after matching because it records creation provenance.

### Migration Change From Current Schema

- Add `계좌거래ID`.
- Remove `거래후잔액` from the ledger model.
- Keep/add `레코드상태`.
- Redefine `거래구분` as `수입/지출`, not boolean semantics.
- Require `거래금액` to be positive in the ledger.

## 3. 거래증빙

### Purpose

Store evidence attached to ledger entries. Evidence may include Toss transaction-detail screenshots, receipts, transfer confirmations, or other supporting files.

### Target Columns

| Column | Constraint | Meaning |
| --- | --- | --- |
| `증빙ID` | PK | Evidence identifier |
| `거래ID` | FK → `수입지출원장.거래ID` | Owning ledger entry |
| `증빙구분` | NOT NULL | Evidence category |
| `증빙유형` | NOT NULL | File/evidence type |
| `증빙일자` | nullable | Date visible in evidence |
| `증빙금액` | nullable | Amount visible in evidence |
| `Drive파일ID` | NOT NULL | Authoritative original evidence file |
| `파일명` | NOT NULL | Original/display filename |
| `OCR상태` | nullable | OCR processing state |
| `OCR검증결과` | nullable | Validation result against ledger data |
| `담당자ID` | FK → UserDB `사용자.Google이메일` | Registered by |
| `등록일시` | NOT NULL | Registration timestamp |
| `비고` | nullable | Additional notes |

### OCR Principle

OCR output is assistance, not evidence source of truth. The Drive file remains authoritative. Full OCR text and every extracted field do not need permanent relational storage.

## 4. 감사대사

### Purpose

Store one user-triggered reconciliation run for an arbitrary date range. Runs are historical snapshots and may overlap in date range.

### Target Columns

| Column | Constraint |
| --- | --- |
| `대사ID` | PK |
| `감사시작일` | NOT NULL |
| `감사종료일` | NOT NULL |
| `계좌기초잔액` | nullable |
| `계좌기말잔액` | nullable |
| `계좌거래건수` | NOT NULL |
| `원장거래건수` | NOT NULL |
| `정상건수` | NOT NULL |
| `원장누락건수` | NOT NULL |
| `계좌미확인건수` | NOT NULL |
| `확인필요건수` | NOT NULL |
| `대사상태` | NOT NULL |
| `담당자ID` | FK → UserDB `사용자.Google이메일` |
| `실행일시` | NOT NULL |
| `확인일시` | nullable |
| `확인내용` | nullable |

### Removed Concepts

`원장기초잔액` and `원장기말잔액` are removed as stored fields. Ledger balance is a calculated result, while bank opening/closing balances are external facts useful for the reconciliation snapshot.

## 5. 감사대사상세

### Purpose

Store the item-level result snapshot produced by one reconciliation run.

### Target Columns

| Column | Constraint |
| --- | --- |
| `대사상세ID` | PK |
| `대사ID` | FK → `감사대사.대사ID` |
| `계좌거래ID` | FK → `계좌거래.계좌거래ID`, nullable |
| `거래ID` | FK → `수입지출원장.거래ID`, nullable |
| `대사결과` | NOT NULL |
| `차이금액` | nullable |
| `검증내용` | nullable |
| `등록일시` | NOT NULL |

### Result Values

- `정상`
- `원장누락` — bank transaction exists but ledger entry is missing.
- `계좌미확인` — ledger entry exists but bank link is not yet present.
- `확인필요` — a 1:1 link exists but important values do not agree.

### Ownership Rule

This table does not create the bank↔ledger relationship. The current relationship is always read from `수입지출원장.계좌거래ID`.

## 6. 결산보고서

### Purpose

Store a settlement snapshot for an arbitrary date range, including export metadata. Reports are historical and are not recalculated after confirmation.

### Target Columns

| Column | Constraint |
| --- | --- |
| `결산ID` | PK |
| `결산명` | NOT NULL |
| `결산시작일` | NOT NULL |
| `결산종료일` | NOT NULL |
| `기초잔액` | NOT NULL |
| `총수입` | NOT NULL |
| `총지출` | NOT NULL |
| `기말잔액` | NOT NULL |
| `수입건수` | NOT NULL |
| `지출건수` | NOT NULL |
| `미대사건수` | NOT NULL |
| `증빙미비건수` | NOT NULL |
| `결산상태` | NOT NULL |
| `보고서Drive파일ID` | nullable |
| `담당자ID` | FK → UserDB `사용자.Google이메일` |
| `생성일시` | NOT NULL |
| `확정일시` | nullable |
| `비고` | nullable |

### Status Values

- `작성중`
- `확정`

### Snapshot Rule

Confirming a settlement does not lock ledger entries. If ledger data changes later, the confirmed settlement remains unchanged. A new settlement is created when an updated snapshot is required.

## Final Relationships

```text
계좌거래 1 ─── 0..1 수입지출원장
                    │
                    └── 1:N 거래증빙

계좌거래 + 수입지출원장
          │
          ▼
       감사대사 1 ─── N 감사대사상세

수입지출원장
     │
     ▼
 결산보고서 (period snapshot)
```

## Tables Removed From Target Accounting Model

- `계좌OCR로그`
- Any separate file-level `계좌거래가져오기` table

Duplicate prevention is transaction-level through `계좌거래.원본해시`.

## Migration Policy

The implementation must separate schema migration from data correction.

1. Add/create target columns and sheets first.
2. Update code schema and services to understand the v2 structure.
3. Migrate or backfill existing Accounting data using explicit rules.
4. Only after data verification, retire obsolete columns/tables such as ledger `거래후잔액` and `계좌OCR로그`.
5. Do not silently delete historical rows.
6. Preserve auditability of invalidated transactions via record status rather than physical deletion.

## Verification Criteria

The migration is complete only when:

- `계좌거래` rows can be imported from the actual Toss Bank Excel format without losing source semantics.
- Duplicate bank rows are skipped by `원본해시`.
- A bank transaction cannot be linked to more than one ledger entry.
- Manual-first ledger entries can exist temporarily without `계좌거래ID` and can later be matched 1:1.
- Evidence is attached only to ledger entries and retains the authoritative Drive file reference.
- Reconciliation can run for any requested period and produces both summary and item-level snapshot rows.
- Settlement can run for any requested period and confirmed reports remain immutable snapshots without locking ledger edits.
- OperationDB integrity checks validate all PK/FK/header requirements for the v2 Accounting tables.
