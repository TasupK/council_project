# Page-Owned Modal Architecture Design

## Status
This document defines the frontend architecture for page-owned modal markup.

The first reference implementation is Accounting Ledger in PR #27. Student Fee and Event migrate in later independent PRs.

**Settings is explicitly excluded from this modal migration.** Existing Settings modal structure must not be changed as part of this architecture rollout unless the user separately approves a Settings-specific change later.

## Context
The project currently has mixed modal ownership patterns:

- Accounting Ledger historically kept page body, register modal, detail modal, and toast in one `Accounting_Ledger_View.html`.
- Student Fee payer/payment/refund pages keep one or more complete modal trees directly inside their `*_View.html` files.
- Event Detail builds some complete modal shells as JavaScript strings and assigns them to `modalRoot.innerHTML`.
- Shared UI primitives such as `ui-modal`, `ui-modal-overlay`, `ui-field`, and `ui-btn` live in the common UI system.

The Accounting Ledger regression exposed a concrete ownership problem: the register modal retained the legacy `field` class together with `ui-field`, and the legacy fixed-height styling collapsed the form rows.

## Goals
- Give migrated page-specific modals a clear page owner.
- Keep migrated `*_View.html` files focused on visible page content.
- Keep JavaScript responsible for behavior/data binding rather than large modal-shell strings.
- Preserve route, API, DOM ID, form-name, data-action, and business behavior contracts.
- Make modal structure verifiable as a composed page contract.
- Establish one reusable file/folder convention for future migrated pages.

## Non-Goals
- No business-flow redesign.
- No route/API/schema change.
- No forced movement of business-specific modals into `100_common`.
- Dynamic repeated content may still be rendered by JavaScript inside explicit containers.
- PR #27 does not migrate Student Fee or Event production code.
- **Settings is not migrated or scanned for modal restructuring in this rollout.**

## Core Decision
A migrated page-specific modal is stored under that page directory:

```text
<domain>/<page>/
├─ <Page>.html
├─ <Page>_View.html
├─ modals/
│  ├─ <Feature>_Modal.html
│  └─ <Feature>_Modal.html
└─ <page>_js.html
```

The top-level `<Page>.html` is the composition root and includes the View and modal partials as siblings. Modal partials do not contain nested `include()` calls.

Example:

```text
src/400_accounting/410_ledger/
├─ Accounting_Ledger.html
├─ Accounting_Ledger_View.html
├─ modals/
│  ├─ Accounting_Ledger_Register_Modal.html
│  └─ Accounting_Ledger_Detail_Modal.html
└─ accounting_ledger_js.html
```

## Ownership Rules

### `<Page>.html`
- Owns page composition.
- Includes shared shell/styles, View, page-owned modal partials, and page JavaScript.
- Owns a root wrapper when View and modals must share that root.

### `<Page>_View.html`
- Contains visible page-body UI and normal page states such as loading/error/toast when appropriate.
- After migration, contains no page-specific modal overlay/dialog tree.

### `modals/*_Modal.html`
- One modal responsibility per file.
- Contains the stable modal shell and stable controls.
- Preserves IDs, names, data-actions, accessibility hooks, and defaults used by existing JavaScript/tests.
- Uses canonical `ui-*` primitives.
- May expose dynamic content containers.
- Must not contain `<script>` blocks or nested `include()` calls.

### Page JavaScript
- Opens/closes modals.
- Binds data to stable controls.
- Updates states and renders variable internal fragments.
- After migration, does not construct a complete page-specific modal shell as a long HTML string.

### Shared styles
`100_common/App_Styles.html` owns shared primitives such as `ui-modal-overlay`, `ui-modal`, `ui-modal-actions`, `ui-field`, `ui-control`, and `ui-btn`.

Domain CSS owns only domain/page composition such as modal width, grids, upload areas, and detail layouts.

## Naming
Use page/domain-qualified names:

```text
modals/<DomainOrPage>_<Purpose>_Modal.html
```

Examples:
- `Accounting_Ledger_Register_Modal.html`
- `Accounting_Ledger_Detail_Modal.html`
- `Student_Fee_Payer_Edit_Modal.html`
- `Student_Fee_Payment_Detail_Modal.html`
- `Student_Fee_Payment_Confirm_Modal.html`
- `Student_Fee_Refund_Detail_Modal.html`
- `Student_Fee_Refund_Approval_Modal.html`
- `Student_Fee_Refund_Transfer_Modal.html`
- `Event_Applicant_Detail_Modal.html`

A modal becomes common only when its markup, semantics, and interaction contract are genuinely shared and domain-independent.

## Static vs Dynamic Content
HTML owns the stable dialog structure; JavaScript owns data and behavior.

JavaScript may render targeted dynamic fragments such as table rows, detail rows, uploaded-file items, or extra question/answer lists into dedicated containers.

After a modal is migrated, code like this is forbidden for the complete shell:

```js
modalRoot.innerHTML = '<div class="ui-modal-overlay"><section class="ui-modal"> ... </section></div>';
```

## Accessibility
Migrated modals preserve or add:
- `role="dialog"` when appropriate.
- `aria-modal="true"`.
- stable `aria-labelledby` references.
- accessible labels for icon-only close controls.

Focus trapping/restoration is outside this architecture migration unless already implemented.

## Reference Implementation: Accounting Ledger
PR #27 is the first reference implementation.

The register modal preserves IDs `registerModal`, `entryForm`, `expenseBtn`, `incomeBtn`, `formDepartment`, `formEvent`, `eventBalance`, `entryEvidenceDropzone`, `entryEvidenceFile`, `entryEvidenceFileName`, `draft`, `create`, plus form names `transaction_date`, `department_name`, `amount`, `counterparty`, `event_name`, `description`, `note`.

The detail modal preserves IDs `detailModal`, `detailTitle`, `detailStatus`, `detailAlert`, `detailRows`, `detailEvidenceList`, `editLedger`, `deleteLedger`, `approve`.

Both partials use canonical `ui-*` primitives and avoid the legacy standalone `field` class.

## Current Migration Inventory
Known Student Fee static modal trees:
- Payers: payer create/edit modal.
- Payments: detail modal, confirmation modal.
- Refunds: detail modal, approval modal, transfer modal.

Known Event dynamic modal shell:
- Event Detail applicant detail modal currently assembled in JavaScript.

Each implementation PR still performs a fresh inventory before editing.

## Migration Sequence

### PR #27 — Accounting Ledger reference
- Fix legacy `.field` collision.
- Split register/detail modals into `410_ledger/modals/`.
- Make `Accounting_Ledger.html` the composition root.
- Update composed UI verifiers.

### Student Fee modal migration PR
- Migrate the six known static modals.
- Preserve existing IDs, form names, data-actions, mutation sequencing, busy guards, and error behavior.
- Update Student Fee verifiers/tests to inspect composed pages.

### Event modal migration PR
- Inventory Event modal shells.
- Move stable shells to page-owned partials.
- Replace whole-modal `innerHTML` construction with data binding and targeted fragment rendering.
- Preserve Event behavior contracts.

### Final enforcement PR
After Accounting, Student Fee, and Event migration:
- Scan MyPage, Main, Login, and other non-Settings frontend pages for remaining page-specific modal-shell ownership.
- Migrate any remaining approved targets.
- Add project-wide verifier rules for migrated pages and migrated JS.
- **Do not touch or enforce this modal-partial rule against Settings. Settings remains an explicit exception.**

## Verification Strategy
Tests validate composed pages rather than assuming every hook lives in the View:

```text
Page shell + View partial + modal partials
```

For each migrated page, verify:
- View does not own modal shell markup.
- Page includes required modal partials.
- modal partials exist and contain required hooks.
- modal partials use shared `ui-*` primitives.
- no nested include/script exists in modal partials.
- full modal-shell strings are not constructed in migrated page JS.
- targeted dynamic internal rendering remains allowed.

Every migration PR must keep existing behavior tests, full Node regression, architecture/naming verifiers, and fresh GitHub Actions green.

## Rollout Safety
Do not migrate all domains in one PR. Accounting, Student Fee, and Event are separate review/merge units because their modal contracts and rendering styles differ.

Preserve DOM semantics first. Visual redesign should remain separate unless needed to fix a concrete regression.

## Success Criteria
The rollout is complete when:
- Accounting, Student Fee, Event, and any separately approved non-Settings targets follow page-owned modal composition.
- migrated Views contain visible page content rather than hidden modal trees.
- migrated page JS no longer constructs complete page-specific modal shells as strings.
- stable JS hooks are preserved through composition.
- shared presentation remains in the common UI system.
- verifiers prevent regression for migrated targets.
- **Settings remains unchanged unless separately approved later.**
