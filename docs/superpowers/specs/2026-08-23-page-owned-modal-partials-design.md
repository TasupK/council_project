# Page-Owned Modal Partials Design

## Context
Accounting Ledger currently keeps page content, register modal markup, detail modal markup, and toast markup in one `Accounting_Ledger_View.html`. During the shared UI migration, the modal form also retained the legacy `field` class together with `ui-field`. `App_Styles.html` still gives `.field` a fixed `height: 40px`, border, and padding, so the modal field wrappers collapsed and overlapped visually.

## Decision
Page-specific modal markup is owned by the page domain but stored in separate modal partial files. The page shell is responsible for composing the page view and each modal partial as siblings under the same domain root container.

For Accounting Ledger:

```text
src/400_accounting/410_ledger/
├─ Accounting_Ledger.html
├─ Accounting_Ledger_View.html
├─ modals/
│  ├─ Accounting_Ledger_Register_Modal.html
│  └─ Accounting_Ledger_Detail_Modal.html
└─ accounting_ledger_js.html
```

`Accounting_Ledger.html` owns the `.accounting-page` wrapper and includes:

1. `Accounting_Ledger_View`
2. `modals/Accounting_Ledger_Register_Modal`
3. `modals/Accounting_Ledger_Detail_Modal`

The page-specific modal files do not include other files. This avoids nested partial composition and keeps the existing Apps Script `include(filename)` behavior simple.

## Ownership Rules
- `*_View.html`: visible page body and non-modal page UI only.
- `modals/*_Modal.html`: modal markup specific to that page.
- `*_js.html`: existing modal open/close and business interaction logic; IDs remain stable.
- `App_Styles.html`: shared modal/form primitives such as `ui-modal`, `ui-modal-overlay`, `ui-field`, and `ui-btn`.
- domain CSS: only page/domain composition such as ledger modal width, two-column grid, evidence upload, and detail rows.

A page-specific modal is not moved into `100_common` merely because it is a modal. It becomes common only if its markup and interaction contract are genuinely shared across pages.

## Accounting Ledger Contract
The register modal must preserve these IDs and names because `accounting_ledger_js.html` depends on them:
- IDs: `registerModal`, `entryForm`, `expenseBtn`, `incomeBtn`, `formDepartment`, `formEvent`, `eventBalance`, `entryEvidenceDropzone`, `entryEvidenceFile`, `entryEvidenceFileName`, `draft`, `create`.
- form names: `transaction_date`, `department_name`, `amount`, `counterparty`, `event_name`, `description`, `note`.

The detail modal must preserve:
- IDs: `detailModal`, `detailTitle`, `detailStatus`, `detailAlert`, `detailRows`, `detailEvidenceList`, `editLedger`, `deleteLedger`, `approve`.

Both modal partials must use canonical `ui-*` primitives and must not use the legacy standalone `field` class.

## Layout Fix
The register form uses `feature-view` as the vertical composition container. The transaction date/department and amount/counterparty pairs remain inside the existing two-column `.grid`; event, description, note, and evidence fields remain full-width because they live outside that two-column grid. No fixed height is applied to field wrappers.

## Test / Verification Contract
`verify-accounting-ui-reference.js` will enforce:
- `Accounting_Ledger_View.html` contains no modal overlay markup.
- `Accounting_Ledger.html` includes both modal partials.
- modal partial files exist and preserve required IDs/form names.
- register modal has no standalone `field` class.

`verify-ui-system-migration.js` must validate required Accounting hooks across the composed Ledger page instead of assuming every hook lives in `Accounting_Ledger_View.html`.

## Scope
This PR applies the structure only to Accounting Ledger while fixing the reported layout regression. Student Fee, Event, Settings, and other page-specific modals will migrate in later UI cleanup PRs after this pattern is validated.
