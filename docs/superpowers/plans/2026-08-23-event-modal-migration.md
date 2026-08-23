# Event Page-Owned Modal Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the Event Detail applicant modal shell out of JavaScript into a page-owned modal partial, while preserving applicant detail/approve/reject behavior and enforcing the approved modal architecture across Accounting, Student Fee, and Event.

**Architecture:** `Event_Detail.html` remains the composition root. It will include `Event_Detail_View.html` and `modals/Event_Applicant_Detail_Modal.html` as siblings. Stable dialog markup and controls live in the modal partial; `event_detail_applicants_js.html` binds cached applicant data into stable IDs and renders only the variable extra-answer fragment. Settings is explicitly excluded from this architecture migration.

**Tech Stack:** Google Apps Script HTML templates, vanilla HTML/CSS/JavaScript, Node.js contract/verifier scripts, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-08-23-page-owned-modal-partials-design.md`

## Global Constraints
- Do not modify Settings production files or Settings modal structure.
- Do not change Event routes, Apps Script APIs, schemas, or server business logic.
- Preserve the cached-detail behavior: opening the applicant modal must not issue a section read API.
- Preserve applicant approve/reject actions and authenticated manager/processed-at display.
- Stable modal shell belongs to HTML; JavaScript may render only variable fragments inside dedicated containers.
- Do not construct `ui-modal-overlay` / `ui-modal` complete shells as JavaScript strings after migration.
- Keep shared modal primitives in `100_common/App_Styles.html`; Event CSS owns only Event-specific layout.

---

## Target Structure

```text
src/600_event/630_detail/
├─ Event_Detail.html
├─ Event_Detail_View.html
├─ modals/
│  └─ Event_Applicant_Detail_Modal.html
├─ event_detail_core_js.html
├─ event_detail_applicants_js.html
└─ event_detail_bootstrap_js.html
```

### Task 1: Lock Event modal ownership contract (RED)

**Files:**
- Modify: `scripts/verify-event-frontend-architecture.js`
- Modify: `scripts/test-event-detail-sections.js`
- Create: `scripts/verify-page-owned-modal-architecture.js`

**Interfaces:**
- Consumes current Event Detail View + JS generated modal.
- Produces failing contracts requiring an Event applicant modal partial and forbidding complete modal shell construction in JS.

- [ ] Require `630_detail/modals/Event_Applicant_Detail_Modal.html` in Event frontend required files.
- [ ] Require `Event_Detail.html` to include `600_event/630_detail/modals/Event_Applicant_Detail_Modal` after the View include and before page JS includes.
- [ ] Require `Event_Detail_View.html` not to contain the Event modal shell.
- [ ] Require the Event modal partial to contain stable IDs: `ew-modal-root`, `ew-applicant-detail-modal`, `ew-applicant-modal-title`, `ew-applicant-name`, `ew-applicant-student-id`, `ew-applicant-phone`, `ew-applicant-fee-status`, `ew-applicant-payment-status`, `ew-applicant-approval-status`, `ew-applicant-manager`, `ew-applicant-processed-at`, `ew-applicant-extra-answers`, `ew-applicant-reject`, `ew-applicant-approve`.
- [ ] Require the partial to use `ui-modal-overlay`, `ui-modal`, `role="dialog"`, `aria-modal="true"`, and forbid `<script` / nested `include(`.
- [ ] Reject `ui-modal-overlay` and complete `<section class="...ui-modal` strings in `event_detail_applicants_js.html`.
- [ ] Update `test-event-detail-sections.js` to compose applicant JS + modal partial when checking approve/reject buttons and processor details.
- [ ] Add `verify-page-owned-modal-architecture.js` with an explicit migrated-page registry covering Accounting Ledger, Student Fee Payers/Payments/Refunds, and Event Detail only. Do not scan Settings.
- [ ] Run the focused scripts and confirm RED because the Event modal partial does not yet exist and JS still owns the shell.

### Task 2: Extract Event applicant modal shell

**Files:**
- Create: `src/600_event/630_detail/modals/Event_Applicant_Detail_Modal.html`
- Modify: `src/600_event/630_detail/Event_Detail.html`
- Modify: `src/600_event/630_detail/Event_Detail_View.html`

**Interfaces:**
- Produces a static dialog with the same visible content and actions as the current JS-generated modal.

- [ ] Move `#ew-modal-root` out of `Event_Detail_View.html` into the new partial.
- [ ] Add a hidden `#ew-applicant-detail-modal.ui-modal-overlay` under `#ew-modal-root`.
- [ ] Keep close action `data-action="close-modal"` and dialog stop marker `data-modal-stop`.
- [ ] Put stable applicant fields in static `<dd>` / `<span>` targets using the IDs from Task 1.
- [ ] Keep `#ew-applicant-extra-answers` as the only dynamic extra-answer region.
- [ ] Keep the upload placeholder static in the partial.
- [ ] Add reject/approve buttons with stable IDs plus `data-action="process-applicant"` and `data-process="reject|approve"`; JS will set `data-id` and `disabled`.
- [ ] Include the partial immediately after `Event_Detail_View` in `Event_Detail.html`.

### Task 3: Replace whole-modal string rendering with data binding

**Files:**
- Modify: `src/600_event/630_detail/event_detail_applicants_js.html`
- Modify: `src/600_event/630_detail/event_detail_core_js.html`
- Modify: `src/600_event/630_detail/event_detail_bootstrap_js.html`

**Interfaces:**
- `openApplicantModal(applicationId)` remains the public action entry.
- `closeModal(event)` remains the delegated close action.

- [ ] In `openApplicantModal`, resolve the cached applicant exactly as today and preserve the missing-cache toast behavior.
- [ ] Set text fields with `textContent` for name/student ID/phone/manager/processed date.
- [ ] Render the three status targets with `statusBadge(...)` via their dedicated target `innerHTML` only.
- [ ] Render `renderApplicantExtraAnswers_(...)` only into `#ew-applicant-extra-answers`.
- [ ] Set reject/approve `dataset.id`, `disabled`, then set `#ew-applicant-detail-modal.hidden = false`.
- [ ] Change `renderApplicantExtraAnswers_` to return only the variable internal fragment needed by the dedicated container; it must not return a modal shell.
- [ ] Change `closeModal(event)` to hide the active Event applicant modal instead of clearing `modalRoot.innerHTML`.
- [ ] Change successful `processApplicant` to close/hide the static modal instead of clearing root HTML.
- [ ] Change Escape handling to close the visible modal without `modalRoot.innerHTML` checks/clears.

### Task 4: GREEN verification and integration

**Files:**
- Update PR metadata only after code is green.

- [ ] Run `node scripts/test-event-detail-sections.js`.
- [ ] Run `node scripts/verify-event-frontend-architecture.js`.
- [ ] Run `node scripts/verify-page-owned-modal-architecture.js`.
- [ ] Run all `scripts/test-*.js` and all `scripts/verify-*.js`.
- [ ] Confirm GitHub Actions on the synthetic merge ref against latest `main` are all successful.
- [ ] Confirm changed filenames contain Event/test/verifier/docs only and no Settings production files.
- [ ] Squash merge only after the final head and latest main are unchanged and CI is green.
