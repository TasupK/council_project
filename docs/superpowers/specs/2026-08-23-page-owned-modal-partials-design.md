# Page-Owned Modal Architecture Design

## Status
This document defines the project-wide frontend architecture for modal ownership and composition. It supersedes the earlier Accounting-Ledger-only version of this document.

The first reference implementation remains Accounting Ledger in PR #27. Other domains migrate in later PRs after that reference implementation is validated in the browser.

## Context
The project currently has several different modal ownership patterns:

- Accounting Ledger historically kept page body, register modal, detail modal, and toast in one `Accounting_Ledger_View.html`.
- Student Fee payer/payment/refund pages keep one or more complete modal trees directly inside their `*_View.html` files.
- Event Detail builds some complete modal shells as JavaScript strings and assigns them to `modalRoot.innerHTML`.
- Shared UI primitives such as `ui-modal`, `ui-modal-overlay`, `ui-field`, and `ui-btn` now live in the common UI system.

These mixed patterns make page files harder to review, blur the boundary between markup and behavior, and make UI regressions easier to introduce. The Accounting Ledger regression exposed one concrete example: the modal form retained the legacy `field` class together with `ui-field`; `App_Styles.html` still gave `.field` a fixed height/border/padding, which collapsed the wrapper and caused visible overlap.

The modal bug should be fixed locally, but the ownership problem should be solved consistently across the frontend.

## Goals
- Give every page-specific modal a clear file owner.
- Keep `*_View.html` focused on the visible page body rather than hidden modal trees.
- Keep JavaScript responsible for behavior/data binding rather than large HTML shell strings.
- Preserve all existing route, API, DOM ID, form-name, and business behavior contracts during migration.
- Make modal structure testable as a composed page contract.
- Establish one reusable folder/naming convention for future pages.

## Non-Goals
- This architecture change does not redesign business flows.
- It does not move business-specific modals into `100_common` merely to reduce file count.
- It does not require all modal internals to be static; repeatable/dynamic content may still be rendered by JavaScript inside explicit content containers.
- It does not change Apps Script routing or server APIs.
- It does not migrate every domain in PR #27.

## Core Decision
Page-specific modal markup is owned by the page domain and stored in separate modal partial files under that page directory.

The page's top-level `Page.html` is the composition root. It includes the visible View and all page-owned modal partials as sibling includes.

Canonical page structure:

```text
<domain>/<page>/
├─ <Page>.html
├─ <Page>_View.html
├─ modals/
│  ├─ <Feature>_Modal.html
│  └─ <Feature>_Modal.html
└─ <page>_js.html
```

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

## Composition Rule
The top-level page shell owns the domain/page root wrapper and composes siblings:

```html
<main class="main accounting-main">
  <div class="accounting-page">
    <?!= include('400_accounting/410_ledger/Accounting_Ledger_View'); ?>
    <?!= include('400_accounting/410_ledger/modals/Accounting_Ledger_Register_Modal'); ?>
    <?!= include('400_accounting/410_ledger/modals/Accounting_Ledger_Detail_Modal'); ?>
  </div>
</main>
```

Modal partials must not include other files.

The current Apps Script helper uses `HtmlService.createHtmlOutputFromFile(filename).getContent()`. Keeping composition at the top-level template avoids relying on nested partial evaluation and makes the final page structure explicit.

## File Ownership Rules
### `<Page>.html`
- Owns page composition.
- Includes shared styles/shell assets.
- Includes `<Page>_View.html`.
- Includes every page-owned modal partial as a sibling.
- Includes page JavaScript.
- Owns the domain/page root wrapper when that wrapper must contain both View and modal siblings.

### `<Page>_View.html`
- Contains visible page body UI.
- May contain loading, empty-state, toast, and page-level content regions.
- Must not contain a page-specific modal overlay/dialog tree after that page is migrated.
- Must not act as a hidden component registry.

### `modals/*_Modal.html`
- One modal responsibility per file.
- Contains the stable modal shell and stable controls.
- Preserves IDs, names, data-actions, accessibility attributes, and other hooks required by existing JavaScript/tests.
- Uses canonical `ui-*` primitives for shared presentation.
- May expose dedicated dynamic content containers for repeated or conditional content.
- Must not contain `<script>` blocks or nested `include()` calls.

### `<page>_js.html` and page JS modules
- Open/close modals.
- Bind data to stable modal fields.
- Enable/disable controls and update states.
- Render repeated/variable content inside designated content containers.
- Must not own a complete page-specific modal shell as a long HTML string once that modal has migrated.

### `100_common/App_Styles.html`
Owns shared modal/form primitives only, including:
- `ui-modal-overlay`
- `ui-modal`
- `ui-modal-desc`
- `ui-modal-actions`
- `ui-field`
- `ui-control`
- `ui-btn`
- semantic shared variants

### Domain CSS
Owns only domain/page-specific composition, for example:
- modal width overrides
- domain-specific grids
- evidence/upload regions
- detail row composition
- business-specific visual groupings

Domain CSS must not reimplement the shared modal primitive itself.

## Naming Rules
Use a page/domain-qualified filename so files remain understandable in Apps Script and GitHub searches:

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

A modal is not placed in `100_common` simply because multiple pages have a button labeled confirm/cancel. It is common only when its markup, semantics, and interaction contract are genuinely domain-independent and reused.

## Static and Dynamic Modal Content
The modal shell should be static whenever possible.

JavaScript may still render variable content inside a dedicated container:

```html
<div id="event-applicant-extra-answers"></div>
```

Good JS responsibility:

```js
setText('event-applicant-name', item.name);
renderExtraAnswers(document.getElementById('event-applicant-extra-answers'), item.extraAnswers);
openModal('event-applicant-detail-modal');
```

Targeted dynamic fragments such as table rows, definition-list rows, uploaded-file entries, or variable question/answer lists are allowed.

After migration, JavaScript should not construct the whole page-specific shell like:

```js
modalRoot.innerHTML = '<div class="ui-modal-overlay"><section class="ui-modal"> ... </section></div>';
```

The architectural boundary is: **HTML owns the stable dialog structure; JS owns data and behavior.**

## Accessibility Contract
Each migrated modal should preserve or add the normal dialog contract:
- `role="dialog"` when appropriate.
- `aria-modal="true"`.
- `aria-labelledby` pointing at a stable modal title ID.
- close controls with an accessible label when the visible label is only an icon.

Focus trapping/restoration is outside this architecture migration unless already implemented, but the markup split must not make existing accessibility behavior worse.

## Reference Implementation: Accounting Ledger
PR #27 remains the first implementation of this architecture.

The register modal preserves:
- IDs: `registerModal`, `entryForm`, `expenseBtn`, `incomeBtn`, `formDepartment`, `formEvent`, `eventBalance`, `entryEvidenceDropzone`, `entryEvidenceFile`, `entryEvidenceFileName`, `draft`, `create`.
- form names: `transaction_date`, `department_name`, `amount`, `counterparty`, `event_name`, `description`, `note`.

The detail modal preserves:
- IDs: `detailModal`, `detailTitle`, `detailStatus`, `detailAlert`, `detailRows`, `detailEvidenceList`, `editLedger`, `deleteLedger`, `approve`.

Both modal partials use canonical `ui-*` primitives and do not use the legacy standalone `field` class.

The register form uses `feature-view` as a vertical composition container. Transaction date/department and amount/counterparty remain in the two-column `.grid`; event, description, note, and evidence fields remain full-width outside that grid. No fixed height is applied to field wrappers.

## Current Migration Inventory
Known static modal trees currently embedded in View files include at least:
- Student Fee Payers: payer create/edit modal.
- Student Fee Payments: payment detail modal, payment confirm modal.
- Student Fee Refunds: refund detail modal, refund approval modal, refund transfer modal.

Known dynamically generated modal shells include at least:
- Event Detail applicant detail modal, currently assembled in JavaScript and written to `modalRoot.innerHTML`.

The implementation plan for each domain must perform a fresh inventory before editing; this list is a known starting point, not an excuse to skip repository scanning.

## Migration Sequence
Migration is intentionally split into independently reviewable PRs.

### PR #27 — Accounting Ledger reference implementation
- Fix the reported legacy `.field` collision.
- Split register/detail modals into `410_ledger/modals/`.
- Make `Accounting_Ledger.html` the composition root.
- Update Accounting/composed UI verifiers.
- Require browser QA before merge because this PR addresses a visual regression.

### Student Fee modal migration PR
- Migrate Payers modal.
- Migrate Payment detail and confirmation modals.
- Migrate Refund detail, approval, and transfer modals.
- Preserve all existing Student Fee IDs, form names, data-actions, mutation sequencing, and busy/error behavior.
- Update Student Fee frontend tests/verifiers to validate the composed page rather than assuming all hooks live in `*_View.html`.

### Event modal migration PR
- Inventory all Event modal shells, including dynamically generated ones.
- Move stable modal shells into page-owned `modals/` partials.
- Replace whole-modal `innerHTML` construction with data binding and targeted dynamic fragment rendering.
- Preserve applicant approval/rejection and other existing Event behavior contracts.

### Final architecture enforcement PR
After migrated domains are complete:
- Scan Settings, MyPage, Main, Login, and any remaining frontend pages.
- Migrate any remaining page-specific modal shells.
- Add a project-wide verifier preventing migrated `*_View.html` files from owning modal shells.
- Add a verifier preventing migrated JS from constructing full page-specific `ui-modal-overlay`/`ui-modal` shells as strings.
- Keep an explicit allow-list only for genuinely shared/common modal infrastructure if one exists.

## Verification Strategy
Tests must validate the **composed page**, not a single View file.

A verifier may compose sources conceptually as:

```text
Page shell + View partial + modal partials
```

It should then verify the stable DOM hooks required by the page JavaScript.

### Page-level architecture checks
For a migrated page:
- `*_View.html` contains no page-specific modal shell.
- `<Page>.html` includes the required modal partials.
- required `modals/*_Modal.html` files exist.
- modal partials contain expected stable IDs/form names/data-actions.
- modal partials use shared `ui-*` primitives.
- domain CSS does not own shared modal primitives.

### JavaScript architecture checks
For a migrated modal:
- full modal shell strings are not assembled in page JS.
- targeted rendering of variable internal fragments remains allowed.
- existing business behavior tests continue to pass.

### Regression requirements
Every migration PR must keep:
- route contracts unchanged unless separately approved.
- server/API contracts unchanged unless separately approved.
- existing mutation behavior tests green.
- full Node regression suite green.
- architecture/naming verifiers green.
- fresh GitHub Actions green on the current base/head combination.

## Rollout Safety
Do not migrate all domains in a single PR.

Reasons:
- modal DOM IDs are tightly coupled to page JavaScript.
- some Event modals are generated dynamically and require a different migration technique from static Student Fee modals.
- smaller PRs make visual regressions and contract mistakes easier to isolate.

Each migration PR should preserve DOM semantics first; visual redesign belongs to the ongoing UI-system migration and should not be bundled unless required to fix a concrete regression.

## Success Criteria
This architecture migration is complete when:
- every page-specific modal has an explicit page owner.
- migrated `*_View.html` files contain visible page content only, not hidden modal trees.
- migrated page JS no longer builds complete page-specific modal shells as strings.
- all stable JS hooks remain preserved through partial composition.
- shared modal presentation comes from the common UI system.
- project-wide verifiers prevent regression back to mixed ownership patterns.
