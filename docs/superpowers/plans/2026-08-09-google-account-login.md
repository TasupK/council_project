# Google Account Login Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create a separate operational Google Spreadsheet with a `USER` tab and add a Google-account allowlist login flow to the student council Apps Script web app.

**Architecture:** The web app obtains the current Google account email through Apps Script, then delegates deterministic user matching to small pure functions that can be tested locally. Runtime configuration stores the operational spreadsheet ID in Script Properties, while `index.html` owns the login, loading, error, and welcome states.

**Tech Stack:** Google Apps Script V8, HtmlService, SpreadsheetApp, PropertiesService, Session, HTML/CSS/JavaScript, Node.js built-in test runner

## Global Constraints

- Keep the API design spreadsheet read-only and use it only as a reference.
- Create a separate Google Spreadsheet named `학생회_통합업무관리_DB`.
- Store approved users in a `USER` tab with columns `사용자ID`, `이메일`, `이름`, `역할`, `사용여부`, `등록일`, `수정일`.
- Do not store passwords or authentication tokens.
- Normalize emails by trimming whitespace and converting to lowercase.
- Reject missing, unregistered, inactive, and duplicate accounts without exposing internal error details.
- The successful first screen shows only the current user's name and role; dashboard features are out of scope.
- Keep the login screen responsive with no overlapping or clipped content.

---

### Task 1: Operational USER Spreadsheet

**Files:**
- Create externally: Google Spreadsheet `학생회_통합업무관리_DB`
- Modify externally: `USER!A1:G2`

**Interfaces:**
- Consumes: approved design fields and Google Sheets connector
- Produces: a spreadsheet ID and a `USER` tab whose rows match `[userId, email, name, role, enabled, createdAt, updatedAt]`

- [ ] **Step 1: Create the standalone operational spreadsheet**

Create a new native Google Spreadsheet named `학생회_통합업무관리_DB`. Confirm its spreadsheet ID differs from the API design spreadsheet ID `1XUPJO-tY3wI4SSb8lWORL084Y4QNSNGgPmaIU8sgzzE`.

- [ ] **Step 2: Create and format the USER tab**

Write this exact header row to `USER!A1:G1`:

```text
사용자ID | 이메일 | 이름 | 역할 | 사용여부 | 등록일 | 수정일
```

Freeze row 1, apply a readable header style, size the columns for their content, and add a `Y/N` dropdown to column E.

- [ ] **Step 3: Add a non-personal example row**

Write this exact row to `USER!A2:G2`:

```text
USR_EXAMPLE | admin@example.com | 예시 사용자 | ADMIN | N | (빈 값) | (빈 값)
```

The example remains inactive so it cannot authorize a real login accidentally.

- [ ] **Step 4: Verify the spreadsheet**

Read metadata and `USER!A1:G2`. Expected: one `USER` tab, exact headers, inactive example row, and a spreadsheet ID different from the reference API design spreadsheet.

### Task 2: Testable Login Decision Logic

**Files:**
- Create: `tests/login.test.js`
- Modify: `Code.js`

**Interfaces:**
- Consumes: `findAuthorizedUser(rows, email)` where `rows` is a two-dimensional array including the header row
- Produces: `normalizeEmail(value)`, `findAuthorizedUser(rows, email)`, and stable result objects shaped as `{ ok, code, message, user? }`

- [ ] **Step 1: Write failing tests for email normalization and an active user**

```javascript
const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeEmail, findAuthorizedUser } = require('../Code.js');

const rows = [
  ['사용자ID', '이메일', '이름', '역할', '사용여부', '등록일', '수정일'],
  ['USR001', ' council@example.com ', '홍길동', 'ADMIN', 'Y', '', ''],
];

test('normalizeEmail trims and lowercases an address', () => {
  assert.equal(normalizeEmail(' Council@Example.COM '), 'council@example.com');
});

test('findAuthorizedUser returns the active matching user', () => {
  assert.deepEqual(findAuthorizedUser(rows, 'COUNCIL@example.com'), {
    ok: true,
    code: 'AUTHORIZED',
    message: '로그인되었습니다.',
    user: {
      id: 'USR001',
      email: 'council@example.com',
      name: '홍길동',
      role: 'ADMIN',
    },
  });
});
```

- [ ] **Step 2: Run the tests and verify RED**

Run: `node --test tests/login.test.js`

Expected: FAIL because `normalizeEmail` and `findAuthorizedUser` are not exported.

- [ ] **Step 3: Implement the minimum normalization and active-user lookup**

Add Apps Script-compatible function declarations to `Code.js`, with a guarded CommonJS export:

```javascript
function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function findAuthorizedUser(rows, email) {
  const normalizedEmail = normalizeEmail(email);
  const matches = rows.slice(1).filter((row) => normalizeEmail(row[1]) === normalizedEmail);

  if (matches.length === 1 && String(matches[0][4]).trim().toUpperCase() === 'Y') {
    return {
      ok: true,
      code: 'AUTHORIZED',
      message: '로그인되었습니다.',
      user: {
        id: String(matches[0][0] || ''),
        email: normalizedEmail,
        name: String(matches[0][2] || ''),
        role: String(matches[0][3] || ''),
      },
    };
  }

  return { ok: false, code: 'UNAUTHORIZED', message: '승인되지 않은 계정입니다.' };
}

if (typeof module !== 'undefined') {
  module.exports = { normalizeEmail, findAuthorizedUser };
}
```

- [ ] **Step 4: Run the test and verify GREEN**

Run: `node --test tests/login.test.js`

Expected: both tests PASS.

- [ ] **Step 5: Add failing tests for all rejection cases**

```javascript
test('findAuthorizedUser rejects a missing email', () => {
  assert.equal(findAuthorizedUser(rows, '').code, 'EMAIL_UNAVAILABLE');
});

test('findAuthorizedUser rejects an unregistered email', () => {
  assert.equal(findAuthorizedUser(rows, 'other@example.com').code, 'UNREGISTERED');
});

test('findAuthorizedUser rejects an inactive user', () => {
  const inactive = [rows[0], ['USR002', 'off@example.com', '중지 사용자', 'MEMBER', 'N', '', '']];
  assert.equal(findAuthorizedUser(inactive, 'off@example.com').code, 'INACTIVE');
});

test('findAuthorizedUser rejects duplicate emails', () => {
  const duplicate = [rows[0], rows[1], ['USR002', 'council@example.com', '중복', 'MEMBER', 'Y', '', '']];
  assert.equal(findAuthorizedUser(duplicate, 'council@example.com').code, 'DUPLICATE_USER');
});
```

- [ ] **Step 6: Run the rejection tests and verify RED**

Run: `node --test tests/login.test.js`

Expected: FAIL because the implementation currently returns only `UNAUTHORIZED`.

- [ ] **Step 7: Implement distinct safe rejection results**

Update `findAuthorizedUser` so missing email returns `EMAIL_UNAVAILABLE`, no match returns `UNREGISTERED`, multiple matches return `DUPLICATE_USER`, and a single non-`Y` match returns `INACTIVE`. Each result must have a concise Korean user message and must not include spreadsheet details.

- [ ] **Step 8: Run all login decision tests**

Run: `node --test tests/login.test.js`

Expected: all tests PASS with no warnings.

- [ ] **Step 9: Commit the pure login decision logic**

```powershell
git add -- Code.js tests/login.test.js
git commit -m "feat: add tested login authorization rules"
```

### Task 3: Apps Script Spreadsheet Integration

**Files:**
- Modify: `Code.js`
- Modify: `appsscript.json`
- Test: `tests/login.test.js`

**Interfaces:**
- Consumes: Script Property `USER_SPREADSHEET_ID`, `Session.getActiveUser().getEmail()`, and `findAuthorizedUser(rows, email)`
- Produces: `checkLogin()` returning the same safe result shape used by the pure logic

- [ ] **Step 1: Write a failing integration-boundary test**

Add a dependency-injected function test:

```javascript
const { checkLoginWithServices } = require('../Code.js');

test('checkLoginWithServices reads rows and delegates authorization', () => {
  const result = checkLoginWithServices({
    getEmail: () => 'council@example.com',
    getRows: () => rows,
  });
  assert.equal(result.ok, true);
  assert.equal(result.user.name, '홍길동');
});

test('checkLoginWithServices hides data-source failures', () => {
  const result = checkLoginWithServices({
    getEmail: () => 'council@example.com',
    getRows: () => { throw new Error('spreadsheet id leaked'); },
  });
  assert.deepEqual(result, {
    ok: false,
    code: 'SERVICE_ERROR',
    message: '로그인 확인 중 문제가 발생했습니다. 잠시 후 다시 시도해 주세요.',
  });
});
```

- [ ] **Step 2: Run the boundary tests and verify RED**

Run: `node --test tests/login.test.js`

Expected: FAIL because `checkLoginWithServices` does not exist.

- [ ] **Step 3: Implement the injected boundary and Apps Script adapter**

Add:

```javascript
function checkLoginWithServices(services) {
  try {
    return findAuthorizedUser(services.getRows(), services.getEmail());
  } catch (error) {
    console.error(error);
    return {
      ok: false,
      code: 'SERVICE_ERROR',
      message: '로그인 확인 중 문제가 발생했습니다. 잠시 후 다시 시도해 주세요.',
    };
  }
}

function checkLogin() {
  return checkLoginWithServices({
    getEmail: () => Session.getActiveUser().getEmail(),
    getRows: () => {
      const spreadsheetId = PropertiesService.getScriptProperties()
        .getProperty('USER_SPREADSHEET_ID');
      if (!spreadsheetId) throw new Error('USER_SPREADSHEET_ID is missing');
      return SpreadsheetApp.openById(spreadsheetId)
        .getSheetByName('USER')
        .getDataRange()
        .getDisplayValues();
    },
  });
}
```

Export `checkLoginWithServices` only inside the existing guarded CommonJS block.

- [ ] **Step 4: Add the minimum spreadsheet OAuth scope**

Set `oauthScopes` in `appsscript.json` to include:

```json
[
  "https://www.googleapis.com/auth/spreadsheets.readonly",
  "https://www.googleapis.com/auth/userinfo.email"
]
```

- [ ] **Step 5: Run tests and syntax checks**

Run: `node --test tests/login.test.js`

Run: `node --check Code.js`

Expected: all tests PASS and syntax check exits successfully.

- [ ] **Step 6: Configure the operational spreadsheet ID**

Set Apps Script Script Property `USER_SPREADSHEET_ID` to the spreadsheet ID produced in Task 1. Do not hard-code the ID in `index.html`.

- [ ] **Step 7: Commit the Apps Script integration**

```powershell
git add -- Code.js appsscript.json tests/login.test.js
git commit -m "feat: connect login authorization to USER sheet"
```

### Task 4: Responsive Login Interface

**Files:**
- Modify: `index.html`
- Modify: `Code.js`
- Create: `tests/login-page.test.js`

**Interfaces:**
- Consumes: `google.script.run.withSuccessHandler(...).withFailureHandler(...).checkLogin()`
- Produces: accessible login, loading, error, and welcome states in a single stable page

- [ ] **Step 1: Inspect the provided Figma channel**

Attempt a read-only connection to Figma channel `t5ocfhwa`. If readable, record the relevant login frame's typography, colors, spacing, and component states before writing HTML. If the channel is unavailable or contains no login frame, use the approved restrained student-council work-tool style with an 8px maximum card radius.

- [ ] **Step 2: Write a failing static contract test**

Create `tests/login-page.test.js`:

```javascript
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

test('login page exposes required states and Apps Script call', () => {
  assert.match(html, /id="login-view"/);
  assert.match(html, /id="loading-view"/);
  assert.match(html, /id="error-view"/);
  assert.match(html, /id="welcome-view"/);
  assert.match(html, /\.checkLogin\(\)/);
});
```

- [ ] **Step 3: Run the page test and verify RED**

Run: `node --test tests/login-page.test.js`

Expected: FAIL because the current placeholder page has none of the required states.

- [ ] **Step 4: Implement the login page**

Replace the placeholder in `index.html` with:

- a first-viewport student council brand signal;
- one Google account login button;
- fixed-size loading state with an accessible status message;
- retryable error state populated only with the safe server message;
- welcome state containing the authorized user's name and role;
- responsive CSS supporting 320px mobile width through desktop;
- no password fields, decorative gradient blobs, nested cards, or instructional feature copy.

The button handler must disable repeated submission, show `loading-view`, call `checkLogin()`, and switch to either `welcome-view` or `error-view`.

- [ ] **Step 5: Update the web app title**

Change `doGet()` in `Code.js` to set the title to `학생회 통합업무관리` and add `XFrameOptionsMode.ALLOWALL` only if the verified deployment context requires embedding. Otherwise keep the default frame protection.

- [ ] **Step 6: Run page and server checks**

Run: `node --test tests/login.test.js tests/login-page.test.js`

Run: `node --check Code.js`

Expected: all tests PASS and syntax check exits successfully.

- [ ] **Step 7: Render and inspect the page**

Serve or open the HTML through a local test harness that stubs `google.script.run`. Capture desktop and mobile screenshots. Verify the page is nonblank, button and text do not overlap, all states fit their containers, and the longest Korean error message wraps cleanly.

- [ ] **Step 8: Commit the interface**

```powershell
git add -- Code.js index.html tests/login-page.test.js
git commit -m "feat: build Google account login page"
```

### Task 5: Deployment Verification and Handoff

**Files:**
- Modify: `README.md`

**Interfaces:**
- Consumes: completed Apps Script files, Script Property, deployment URL, and an approved test user
- Produces: repeatable setup and deployment instructions plus verified login behavior

- [ ] **Step 1: Document setup without sensitive values**

Add README sections for:

- setting `USER_SPREADSHEET_ID` in Script Properties;
- adding a real user to the `USER` tab with `사용여부=Y`;
- deploying as a web app so the active user's email is available;
- expected behavior for approved and unapproved accounts.

Do not include a real email address or spreadsheet ID in the repository.

- [ ] **Step 2: Push the Apps Script project**

Run: `clasp push`

Expected: all local Apps Script files upload successfully.

- [ ] **Step 3: Verify the deployed app**

Open the deployment URL with an approved Google account and confirm the welcome state displays only that account's name and role. Open with an unregistered account, or temporarily use an inactive test row, and confirm the safe access-denied state.

- [ ] **Step 4: Run the final local verification**

Run: `node --test tests/login.test.js tests/login-page.test.js`

Run: `node --check Code.js`

Run: `git diff --check`

Expected: all tests PASS, syntax check succeeds, and no whitespace errors are reported.

- [ ] **Step 5: Commit documentation**

```powershell
git add -- README.md
git commit -m "docs: add login deployment guide"
```
