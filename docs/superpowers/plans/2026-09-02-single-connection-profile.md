# Single Connection Profile Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace hardcoded Google Sheets/Drive IDs with one validated Script Properties connection profile that administrators can inspect and replace from Settings Home.

**Architecture:** `src/backend/app/config/connection_profile.gs` owns Script Properties and optimistic revision updates. Candidate Spreadsheet/Folder validators receive explicit resources and never mutate the active profile; Settings IAM application code authorizes and orchestrates replacement, while existing DB openers consume the profile through a single accessor. Settings Home renders three independent cards.

**Tech Stack:** Google Apps Script V8, PropertiesService, SpreadsheetApp, DriveApp, CacheService, LockService, HTML Service, vanilla JavaScript, Node.js contract tests using `assert`/`fs`/`vm`.

**Spec:** `docs/superpowers/specs/2026-09-02-single-connection-profile-design.md`

## Global Constraints

- Store exactly one profile with `OPERATION_DB_ID`, `USER_DB_ID`, and `ROOT_FOLDER_ID`.
- Do not add year fields, profile lists, activation state, automatic resource creation, or disconnect APIs/UI.
- Validate candidates before changing Script Properties; failed validation preserves the current ID.
- Runtime resource access must not fall back to `DB_CONFIG` after migration.
- Only the connection profile module may read/write connection keys with `PropertiesService`.
- Candidate validators receive explicit Spreadsheet/Folder objects and never switch the active profile.
- Hold Script Lock only for the final compare-and-set, never during full integrity validation.
- Protect mutations with `SYSTEM_CONNECTION_MANAGE`; seed it for `role_admin`.
- A candidate UserDB must preserve the current administrator and current operation DB cross-references.
- UserDB replacement advances `LOGIN_CONTEXT_CACHE_GENERATION`.
- Preserve API Contract v1, private trailing-underscore naming, and named `function` style.
- Run `git diff --check` before every task commit.

---

## File Structure

**Create**

- `src/backend/app/config/connection_profile.gs` — keys, DTO, optimistic replacement, metadata, revision, migration.
- `src/backend/core/db/schema/connection_candidate_validation.gs` — explicit candidate operation/UserDB validation.
- `src/backend/core/storage/root_folder_validation.gs` — candidate folder access/write probe.
- `src/backend/domains/iam/application/settings_connections.gs` — authorization, URL parsing, validation orchestration, admin safety.
- `scripts/test-connection-profile.js` — repository and migration tests.
- `scripts/test-connection-candidates.js` — explicit Spreadsheet/Folder candidate tests.
- `scripts/test-settings-connections.js` — permissions, rollback, concurrency, cache-generation tests.

**Modify**

- `src/backend/app/config/config.gs`
- `src/backend/core/db/sheets.gs`
- `src/backend/core/db/schema/user_db_integrity.gs`
- `src/backend/core/db/schema/operation_db_integrity.gs`
- `src/backend/core/auth/auth_cache.gs`
- `src/backend/domains/iam/application/settings_access.gs`
- `src/backend/domains/iam/controllers/settings_home_controller.gs`
- `src/frontend/entities/iam/api/settings_client_js.html`
- `src/frontend/pages/settings_home/Settings_Home_View.html`
- `src/frontend/pages/settings_home/settings_home_controller_js.html`
- `src/frontend/widgets/settings_shell/Settings_Styles.html`
- `scripts/test-settings.js`
- `scripts/test-settings-fsd-home.js`
- `scripts/test-auth-iam.js`
- `scripts/test-api-contract-v1-settings.js`
- `scripts/test-project-architecture.js`

---

### Task 1: Add the Script Properties connection profile repository

**Files:**
- Create: `src/backend/app/config/connection_profile.gs`
- Create: `scripts/test-connection-profile.js`
- Modify: `scripts/test-project-architecture.js`

**Interfaces:**
- Consumes: `PropertiesService.getScriptProperties()`, `LockService.getScriptLock()`, `getCurrentIsoDateTime_()`.
- Produces:
  - `getConnectionProfile_(): { operationDbId, userDbId, rootFolderId, revision, resources }`
  - `requireConnectionResourceId_(resourceKey): string`
  - `replaceConnectionResource_(resourceKey, candidateId, actorEmail, expectedRevision): object`
  - `CONNECTION_RESOURCE_KEYS_`, `CONNECTION_PROFILE_REVISION_KEY_`, `LOGIN_CONTEXT_CACHE_GENERATION_KEY_`.

- [ ] **Step 1: Write the failing repository test**

Create a VM harness in `scripts/test-connection-profile.js`:

```js
var values = {};
var store = {
  getProperty: function (key) {
    return Object.prototype.hasOwnProperty.call(values, key) ? values[key] : null;
  },
  getProperties: function () { return Object.assign({}, values); },
  setProperty: function (key, value) { values[key] = String(value); return store; },
  setProperties: function (entries) {
    Object.keys(entries).forEach(function (key) { values[key] = String(entries[key]); });
    return store;
  }
};
context.PropertiesService = { getScriptProperties: function () { return store; } };
context.LockService = {
  getScriptLock: function () {
    return { waitLock: function () {}, releaseLock: function () {} };
  }
};
```

Assert missing-resource, successful replacement, metadata, revision increment, stale revision, and atomic UserDB cache-generation advancement:

```js
assert.strictEqual(context.getConnectionProfile_().revision, 0);
assert.throws(function () {
  context.requireConnectionResourceId_('operationDb');
}, function (error) { return error.code === 'NOT_CONNECTED'; });

var saved = context.replaceConnectionResource_(
  'operationDb', 'operation-2', 'admin@example.com', 0
);
assert.strictEqual(saved.operationDbId, 'operation-2');
assert.strictEqual(saved.revision, 1);
assert.strictEqual(values.OPERATION_DB_ID_UPDATED_BY, 'admin@example.com');

assert.throws(function () {
  context.replaceConnectionResource_('userDb', 'user-2', 'admin@example.com', 0);
}, function (error) { return error.code === 'CONNECTION_CHANGED'; });
```

Run:

```bash
node scripts/test-connection-profile.js
```

Expected: FAIL because `connection_profile.gs` does not exist.

- [ ] **Step 2: Implement key mapping, DTO, and missing-resource errors**

Use these exact keys:

```js
var CONNECTION_RESOURCE_KEYS_ = {
  operationDb: 'OPERATION_DB_ID',
  userDb: 'USER_DB_ID',
  rootFolder: 'ROOT_FOLDER_ID'
};
var CONNECTION_PROFILE_REVISION_KEY_ = 'CONNECTION_PROFILE_REVISION';
var LOGIN_CONTEXT_CACHE_GENERATION_KEY_ = 'LOGIN_CONTEXT_CACHE_GENERATION';

function getConnectionProfile_() {
  var properties = PropertiesService.getScriptProperties().getProperties();
  return {
    operationDbId: properties.OPERATION_DB_ID || '',
    userDbId: properties.USER_DB_ID || '',
    rootFolderId: properties.ROOT_FOLDER_ID || '',
    revision: Number(properties.CONNECTION_PROFILE_REVISION || 0),
    resources: {
      operationDb: buildConnectionResourceMeta_('operationDb', properties),
      userDb: buildConnectionResourceMeta_('userDb', properties),
      rootFolder: buildConnectionResourceMeta_('rootFolder', properties)
    }
  };
}
```

`requireConnectionResourceId_()` throws an Error with `code = 'NOT_CONNECTED'` and `details.resource = resourceKey`.

- [ ] **Step 3: Implement short-lock optimistic replacement**

```js
function replaceConnectionResource_(resourceKey, candidateId, actorEmail, expectedRevision) {
  var propertyKey = requireConnectionPropertyKey_(resourceKey);
  var lock = LockService.getScriptLock();
  lock.waitLock(5000);
  try {
    var properties = PropertiesService.getScriptProperties();
    var currentRevision = Number(
      properties.getProperty(CONNECTION_PROFILE_REVISION_KEY_) || 0
    );
    if (currentRevision !== Number(expectedRevision)) {
      throwConnectionProfileError_(
        'CONNECTION_CHANGED',
        '연결 정보가 이미 변경되었습니다.',
        { expectedRevision: Number(expectedRevision), actualRevision: currentRevision }
      );
    }
    var nextRevision = currentRevision + 1;
    var updatedAt = getCurrentIsoDateTime_();
    var entries = {};
    entries[propertyKey] = String(candidateId || '').trim();
    entries[propertyKey + '_UPDATED_AT'] = updatedAt;
    entries[propertyKey + '_UPDATED_BY'] = normalizeEmail_(actorEmail);
    entries[CONNECTION_PROFILE_REVISION_KEY_] = String(nextRevision);
    if (resourceKey === 'userDb') {
      entries[LOGIN_CONTEXT_CACHE_GENERATION_KEY_] = String(
        Number(properties.getProperty(LOGIN_CONTEXT_CACHE_GENERATION_KEY_) || 0) + 1
      );
    }
    properties.setProperties(entries);
    return getConnectionProfile_();
  } finally {
    lock.releaseLock();
  }
}
```

Candidate validation stays outside this lock.

- [ ] **Step 4: Test atomic UserDB cache-generation advancement**

Add a UserDB replacement assertion:

```js
var beforeGeneration = Number(values.LOGIN_CONTEXT_CACHE_GENERATION || 0);
var next = context.replaceConnectionResource_(
  'userDb', 'user-2', 'admin@example.com', saved.revision
);
assert.strictEqual(next.userDbId, 'user-2');
assert.strictEqual(
  Number(values.LOGIN_CONTEXT_CACHE_GENERATION),
  beforeGeneration + 1
);
```

Operation DB and root folder replacements must not change this generation.

- [ ] **Step 5: Verify and commit**

```bash
node scripts/test-connection-profile.js
node scripts/test-project-architecture.js
git diff --check
git add src/backend/app/config/connection_profile.gs scripts/test-connection-profile.js scripts/test-project-architecture.js
git commit -m "feat: add single connection profile store"
```

Expected: both tests PASS.

---

### Task 2: Parameterize operation DB, UserDB, and folder candidate validation

**Files:**
- Create: `src/backend/core/db/schema/connection_candidate_validation.gs`
- Create: `src/backend/core/storage/root_folder_validation.gs`
- Create: `scripts/test-connection-candidates.js`
- Modify: `src/backend/core/db/schema/user_db_integrity.gs`
- Modify: `src/backend/core/db/schema/operation_db_integrity.gs`

**Interfaces:**
- Consumes: `getUserDbSchema_()`, `getOperationDbSchema_()`, `readTableRows_(spreadsheet, sheetName)`.
- Produces:
  - `validateUserDbSpreadsheetIntegrity_(spreadsheet): { valid, issueCount, issues, tables }`
  - `validateOperationDbSpreadsheetIntegrity_(spreadsheet, userTables): { valid, issueCount, issues }`
  - `validateRootFolderCandidate_(folder): { valid, name }`
  - `openCandidateSpreadsheet_(id, resourceType): Spreadsheet`
  - `openCandidateFolder_(id): Folder`.

- [ ] **Step 1: Write failing explicit-resource tests**

Use fake spreadsheets and ensure candidate validation does not call the active opener:

```js
context.openUserSpreadsheet_ = function () {
  throw new Error('active UserDB must not open during candidate validation');
};
var result = context.validateUserDbSpreadsheetIntegrity_(candidateUserSpreadsheet);
assert.strictEqual(result.valid, true);
assert.ok(result.tables.users.length > 0);
```

Use a fake writable folder:

```js
var trashed = false;
var folder = {
  getName: function () { return '운영 폴더'; },
  isTrashed: function () { return false; },
  createFile: function () {
    return { setTrashed: function (value) { trashed = value; } };
  }
};
assert.strictEqual(context.validateRootFolderCandidate_(folder).valid, true);
assert.strictEqual(trashed, true);
```

Run:

```bash
node scripts/test-connection-candidates.js
```

Expected: FAIL because candidate validators do not exist.

- [ ] **Step 2: Split UserDB snapshot reading from active access**

```js
function readUserDbIntegrityTablesFromSpreadsheet_(spreadsheet, schema) {
  var tables = {};
  Object.keys(schema).forEach(function (tableKey) {
    var table = schema[tableKey];
    var sheet = spreadsheet.getSheetByName(table.sheetName);
    tables[tableKey] = sheet
      ? readTableRows_(spreadsheet, table.sheetName)
      : [];
  });
  return tables;
}
```

`validateUserDbSpreadsheetIntegrity_()` reports missing sheets and headers before PK/FK issues. Keep `validateUserDbIntegrity_()` as an active-DB entrypoint delegating to `validateUserDbSpreadsheetIntegrity_(openUserSpreadsheet_())`.

- [ ] **Step 3: Split operation validation from active openers**

```js
function validateOperationDbSpreadsheetIntegrity_(spreadsheet, userTables) {
  var schema = getOperationDbSchema_();
  var result = readOperationDbIntegrityTables_(spreadsheet, schema);
  var issues = result.issues.slice();
  issues = issues.concat(validateOperationDbHeaders_(schema, result.headers));
  issues = issues.concat(validateOperationDbPrimaryKeys_(schema, result.tables));
  issues = issues.concat(
    validateOperationDbForeignKeysWithUserTables_(schema, result.tables, userTables)
  );
  issues = issues.concat(validateOperationDbBusinessKeys_(schema, result.tables));
  issues = issues.concat(
    validateOperationDbReferenceRules_(schema, result.tables, userTables.users)
  );
  return { valid: issues.length === 0, issueCount: issues.length, issues: issues };
}
```

The existing `validateOperationDbIntegrity_()` delegates with active operation and UserDB snapshots.

- [ ] **Step 4: Implement folder write probing and cleanup**

```js
function validateRootFolderCandidate_(folder) {
  if (!folder || folder.isTrashed()) {
    throwConnectionValidationError_(
      'RESOURCE_ACCESS_DENIED',
      '사용할 수 없는 Drive 폴더입니다.'
    );
  }
  var probe;
  try {
    probe = folder.createFile('.connection-write-probe', 'connection validation');
    probe.setTrashed(true);
  } catch (error) {
    if (probe) {
      try {
        probe.setTrashed(true);
      } catch (cleanupError) {
        console.error('Folder probe cleanup failed.', cleanupError);
      }
    }
    throwConnectionValidationError_(
      'FOLDER_NOT_WRITABLE',
      '선택한 폴더에 파일을 생성할 수 없습니다.'
    );
  }
  return { valid: true, name: folder.getName() };
}
```

- [ ] **Step 5: Verify and commit**

```bash
node scripts/test-connection-candidates.js
node scripts/test-user-db-schema-alignment.js
node scripts/test-operation-business-key-integrity.js
node scripts/test-operation-user-fk-semester-normalization.js
git diff --check
git add src/backend/core/db/schema/connection_candidate_validation.gs src/backend/core/storage/root_folder_validation.gs src/backend/core/db/schema/user_db_integrity.gs src/backend/core/db/schema/operation_db_integrity.gs scripts/test-connection-candidates.js
git commit -m "feat: validate candidate connection resources"
```

Expected: all tests PASS.

---

### Task 3: Add permission seeding and login cache generation

**Files:**
- Create: `scripts/test-settings-connections.js`
- Modify: `src/backend/app/config/connection_profile.gs`
- Modify: `src/backend/core/auth/auth_cache.gs`
- Modify: `src/backend/domains/iam/application/settings_access.gs`
- Modify: `scripts/test-auth-iam.js`

**Interfaces:**
- Produces:
  - `requireConnectionManageCurrent_(): current`
  - `ensureSystemConnectionManagePermission_(): object`
  - `migrateLegacyConnectionProfile_(): object`
  - `getLoginContextCacheGeneration_(): number`.

- [ ] **Step 1: Write failing permission and cache-generation tests**

```js
assert.strictEqual(context.requireConnectionManageCurrent_().isAdmin, true);
context.requireSettingsCurrent_ = function () {
  return { ok: true, isAdmin: false, permissions: { byScreen: {} } };
};
assert.throws(function () {
  context.requireConnectionManageCurrent_();
}, function (error) { return error.code === 'FORBIDDEN'; });
```

In `scripts/test-auth-iam.js`, assert the same email produces different keys when the generation changes from `3` to `4`.

- [ ] **Step 2: Implement the permission guard**

```js
function requireConnectionManageCurrent_() {
  var current = requireSettingsCurrent_();
  requirePermission_(current, {
    id: 'SYSTEM_CONNECTION_MANAGE',
    action: 'edit'
  });
  return current;
}
```

- [ ] **Step 3: Seed the permission and admin mapping idempotently**

Insert when absent:

```js
{
  id: 'SYSTEM_CONNECTION_MANAGE',
  area: '시스템',
  action: '수정',
  name: '시스템 연결 관리',
  description: '운영 DB, 사용자 DB, 루트 폴더 연결 변경',
  active: true
}
```

Also insert `{ roleId: ADMIN_ROLE_ID, permissionId: 'SYSTEM_CONNECTION_MANAGE' }` when that composite mapping is absent.

Implement `migrateLegacyConnectionProfile_()` now that Task 2 candidate validators exist. It returns `already_migrated` when all keys exist, throws `PARTIAL_CONNECTION_PROFILE` for one or two keys, validates all three `DB_CONFIG` resources before a bulk write, seeds revision `1` and cache generation `0`, calls `ensureSystemConnectionManagePermission_()`, and never overwrites existing keys.

Add migration tests for successful bulk save, validation rollback, partial state rejection, permission seeding, and idempotent second execution to `scripts/test-settings-connections.js`.

- [ ] **Step 4: Include generation in login cache keys**

Define `getLoginContextCacheGeneration_()` in `connection_profile.gs`; `auth_cache.gs` consumes the accessor and must not call `PropertiesService` directly.

```js
function getLoginContextCacheGeneration_() {
  return Number(
    PropertiesService.getScriptProperties()
      .getProperty(LOGIN_CONTEXT_CACHE_GENERATION_KEY_) || 0
  );
}

function buildLoginContextCacheKey_(email) {
  var generation = getLoginContextCacheGeneration_();
  var digest = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    normalizeEmail_(email),
    Utilities.Charset.UTF_8
  );
  return LOGIN_CONTEXT_CACHE_PREFIX
    + generation + '_'
    + Utilities.base64EncodeWebSafe(digest);
}
```

The generation is advanced atomically by `replaceConnectionResource_()` when `resourceKey === 'userDb'`; auth-cache code only reads it.

- [ ] **Step 5: Verify and commit**

```bash
node scripts/test-settings-connections.js
node scripts/test-auth-iam.js
node scripts/test-settings.js
git diff --check
git add src/backend/app/config/connection_profile.gs src/backend/core/auth/auth_cache.gs src/backend/domains/iam/application/settings_access.gs scripts/test-settings-connections.js scripts/test-auth-iam.js
git commit -m "feat: secure connection changes and rotate auth cache"
```

Expected: all tests PASS.

---

### Task 4: Implement candidate-first connection mutation APIs

**Files:**
- Create: `src/backend/domains/iam/application/settings_connections.gs`
- Modify: `src/backend/domains/iam/controllers/settings_home_controller.gs`
- Modify: `scripts/test-settings-connections.js`
- Modify: `scripts/test-settings.js`
- Modify: `scripts/test-api-contract-v1-settings.js`

**Interfaces:**
- Consumes: Tasks 1–3.
- Produces:
  - `getSettingsConnectionCards_(): object`
  - `updateSettingsConnection_(resourceType, input, current): object`
  - `api_updateOperationDbConnection`
  - `api_updateUserDbConnection`
  - `api_updateRootFolderConnection`.

- [ ] **Step 1: Add failing API, rollback, and concurrency tests**

For failed validation:

```js
var before = context.getConnectionProfile_();
context.validateUserDbConnectionCandidate_ = function () {
  var error = new Error('broken schema');
  error.code = 'SCHEMA_INVALID';
  throw error;
};
assert.throws(function () {
  context.updateSettingsConnection_('userDb', {
    resourceUrl: 'https://docs.google.com/spreadsheets/d/user-new/edit',
    expectedRevision: before.revision
  }, adminCurrent);
}, function (error) { return error.code === 'SCHEMA_INVALID'; });
assert.strictEqual(context.getConnectionProfile_().userDbId, before.userDbId);
```

Also assert stale revision returns `CONNECTION_CHANGED`, and all public APIs keep Contract v1 envelopes.

- [ ] **Step 2: Parse URLs only on the server**

```js
function extractSpreadsheetIdFromUrl_(value) {
  var match = String(value || '').trim()
    .match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
  if (!match) {
    throwSettingsConnectionError_(
      'INVALID_RESOURCE_URL',
      '올바른 Google Sheets URL을 입력해 주세요.'
    );
  }
  return match[1];
}

function extractFolderIdFromUrl_(value) {
  var match = String(value || '').trim()
    .match(/\/folders\/([a-zA-Z0-9_-]+)/);
  if (!match) {
    throwSettingsConnectionError_(
      'INVALID_RESOURCE_URL',
      '올바른 Google Drive 폴더 URL을 입력해 주세요.'
    );
  }
  return match[1];
}
```

The UI contract accepts URLs, not bare IDs.

- [ ] **Step 3: Implement candidate-first orchestration**

```js
function updateSettingsConnection_(resourceType, input, current) {
  var request = input || {};
  var candidate = validateSettingsConnectionCandidate_(
    resourceType,
    request.resourceUrl,
    current
  );
  var profile = replaceConnectionResource_(
    resourceType,
    candidate.id,
    current.user.email,
    request.expectedRevision
  );
  return buildSettingsConnectionMutationResult_(resourceType, candidate, profile);
}
```

UserDB validation must prove current user active, prove `role_admin` or mapped `SYSTEM_CONNECTION_MANAGE`, and validate current operation DB cross-references against candidate UserDB tables. Missing active-user or administrator access throws `ADMIN_ACCESS_WOULD_BE_LOST`; cross-reference failures throw `SCHEMA_INVALID`.

- [ ] **Step 4: Add public controllers through `apiHandler_`**

```js
function api_updateUserDbConnection(input) {
  return apiHandler_({
    operation: 'updateUserDbConnection',
    input: input,
    service: function (request) {
      var current = requireConnectionManageCurrent_();
      return updateSettingsConnection_('userDb', request, current);
    }
  });
}
```

Add explicit operation and folder counterparts. Do not expose one generic public mutation API.

- [ ] **Step 5: Expand Settings Home DTO**

```js
connections: {
  revision: profile.revision,
  operationDb: buildSettingsConnectionCard_(
    'operationDb', profile, canManageInfrastructure
  ),
  userDb: buildSettingsConnectionCard_(
    'userDb', profile, canManageInfrastructure
  ),
  rootFolder: buildSettingsConnectionCard_(
    'rootFolder', profile, canManageInfrastructure
  )
}
```

Cards return `status`, `connected`, `name`, `url`, `updatedAt`, and `updatedBy`; non-managers receive no raw IDs. Card loading performs only ID presence and lightweight open/access checks, not full schema or integrity validation.

- [ ] **Step 6: Verify and commit**

```bash
node scripts/test-settings-connections.js
node scripts/test-settings.js
node scripts/test-api-contract-v1-settings.js
git diff --check
git add src/backend/domains/iam/application/settings_connections.gs src/backend/domains/iam/controllers/settings_home_controller.gs scripts/test-settings-connections.js scripts/test-settings.js scripts/test-api-contract-v1-settings.js
git commit -m "feat: add validated connection mutation APIs"
```

Expected: all tests PASS.

---

### Task 5: Build the three Settings Home connection cards

**Files:**
- Modify: `src/frontend/entities/iam/api/settings_client_js.html`
- Modify: `src/frontend/pages/settings_home/Settings_Home_View.html`
- Modify: `src/frontend/pages/settings_home/settings_home_controller_js.html`
- Modify: `src/frontend/widgets/settings_shell/Settings_Styles.html`
- Modify: `scripts/test-settings-fsd-home.js`

**Interfaces:**
- Consumes: Task 4 DTO/APIs.
- Produces: three initial-connect/replace/open cards with no disconnect action.

- [ ] **Step 1: Add failing frontend contract assertions**

```js
[
  'operationDbConnectionCard',
  'userDbConnectionCard',
  'rootFolderConnectionCard',
  'operationDbUrlInput',
  'userDbUrlInput',
  'rootFolderUrlInput',
  'btnSaveOperationDb',
  'btnSaveUserDb',
  'btnSaveRootFolder'
].forEach(function (id) {
  assert.ok(view.includes('id="' + id + '"'), 'missing connection UI: ' + id);
});
assert.ok(!view.includes('btnDisconnect'), 'Settings Home must not expose disconnect');
```

Require three client API mappings plus controller calls to `renderConnectionCards_()` and `submitConnectionChange_()`.

Run:

```bash
node scripts/test-settings-fsd-home.js
```

Expected: FAIL.

- [ ] **Step 2: Add entity client methods**

```js
updateOperationDbConnection: function (request) {
  return runAppApi('api_updateOperationDbConnection', request || {});
},
updateUserDbConnection: function (request) {
  return runAppApi('api_updateUserDbConnection', request || {});
},
updateRootFolderConnection: function (request) {
  return runAppApi('api_updateRootFolderConnection', request || {});
}
```

- [ ] **Step 3: Replace old DB/folder blocks with three cards**

Use this structure for each resource, changing IDs and labels per card:

```html
<section class="connection-card ui-card" id="operationDbConnectionCard">
  <div class="connection-card__head">
    <strong>운영 데이터베이스</strong>
    <span class="connection-status" id="operationDbStatus">미연결</span>
  </div>
  <p id="operationDbName">연결된 스프레드시트가 없습니다.</p>
  <p class="connection-card__meta" id="operationDbUpdatedAt"></p>
  <label for="operationDbUrlInput">Google Sheets URL</label>
  <input class="ui-control" id="operationDbUrlInput" type="url" />
  <div class="ui-page-actions">
    <button class="ui-btn primary" id="btnSaveOperationDb" type="button">최초 연결</button>
    <a class="ui-btn outline hidden" id="operationDbOpenLink" target="_blank" rel="noopener">열기</a>
  </div>
</section>
```

Each card renders status, resource name, last change time, URL input, connect/replace button, and Open link. Do not add year/profile/global-save/disconnect controls.

- [ ] **Step 4: Implement render and submit flow**

```js
async function submitConnectionChange_(resourceType) {
  var binding = CONNECTION_CARD_BINDINGS_[resourceType];
  var url = getSettingsElement(binding.inputId).value.trim();
  if (!url) {
    showSettingsError(new Error('연결할 URL을 입력해 주세요.'));
    return;
  }
  if (!window.confirm('현재 연결을 검증된 새 자원으로 변경할까요?')) return;
  setConnectionCardBusy_(resourceType, true);
  try {
    var result = await settingsClient[binding.clientMethod]({
      resourceUrl: url,
      expectedRevision: settingsConnectionRevision_
    });
    applyConnectionMutationResult_(result);
  } catch (error) {
    showSettingsError(error);
    if (error && error.code === 'CONNECTION_CHANGED') loadSettingsHome();
  } finally {
    setConnectionCardBusy_(resourceType, false);
  }
}
```

Failure leaves current resource details and Open link intact.

- [ ] **Step 5: Add reusable state styles**

Use `.connection-card`, `.connection-status`, `.connection-card.is-connected`, `.connection-card.is-error`, and `.connection-card.is-busy`, preserving existing UI tokens and mobile stacking.

- [ ] **Step 6: Verify and commit**

```bash
node scripts/test-settings-fsd-home.js
node scripts/test-settings.js
node scripts/test-frontend-api-mapping.js
node scripts/test-project-architecture.js
git diff --check
git add src/frontend/entities/iam/api/settings_client_js.html src/frontend/pages/settings_home/Settings_Home_View.html src/frontend/pages/settings_home/settings_home_controller_js.html src/frontend/widgets/settings_shell/Settings_Styles.html scripts/test-settings-fsd-home.js
git commit -m "feat: add settings connection cards"
```

Expected: all tests PASS.

---

### Task 6: Migrate legacy IDs and cut over all runtime openers

**Files:**
- Modify: `src/backend/core/db/sheets.gs`
- Modify: `src/backend/app/config/config.gs`
- Modify: `src/backend/app/config/connection_profile.gs`
- Modify: `scripts/test-connection-profile.js`
- Modify: `scripts/test-project-architecture.js`

**Interfaces:**
- Consumes: verified Script Properties from Task 1 migration.
- Produces: profile-backed `openUserSpreadsheet_()`, `openOperationSpreadsheet_()`, and `openRootFolder_()` with no runtime fallback.

- [ ] **Step 1: Deploy and execute the migration-capable intermediate commit**

Using the Task 5 head while `DB_CONFIG` still exists, push to the Apps Script development deployment and run:

```js
migrateLegacyConnectionProfile_()
```

Expected first result:

```js
{
  migrated: true,
  profile: {
    operationDbId: '...',
    userDbId: '...',
    rootFolderId: '...',
    revision: 1
  }
}
```

Run again; expect `{ migrated: false, reason: 'already_migrated' }`. Verify all three ID keys, revision, cache generation, permission row, and `role_admin` mapping before continuing.

- [ ] **Step 2: Write the failing cutover guard**

```js
var configSource = fs.readFileSync(
  path.join(backend, 'app/config/config.gs'), 'utf8'
);
var sheetsSource = fs.readFileSync(
  path.join(backend, 'core/db/sheets.gs'), 'utf8'
);
assert.doesNotMatch(
  configSource,
  /userSpreadsheetId|operationSpreadsheetId|rootFolderId/,
  'config.gs must not contain resource IDs'
);
assert.doesNotMatch(sheetsSource, /DB_CONFIG/);
assert.match(sheetsSource, /requireConnectionResourceId_\('userDb'\)/);
assert.match(sheetsSource, /requireConnectionResourceId_\('operationDb'\)/);
```

Run `node scripts/test-project-architecture.js`; expect FAIL before cutover.

- [ ] **Step 3: Cut over DB and folder openers**

```js
function openUserSpreadsheet_() {
  return SpreadsheetApp.openById(requireConnectionResourceId_('userDb'));
}

function openOperationSpreadsheet_() {
  return SpreadsheetApp.openById(requireConnectionResourceId_('operationDb'));
}

function openRootFolder_() {
  return DriveApp.getFolderById(requireConnectionResourceId_('rootFolder'));
}
```

Change every Drive consumer to call `openRootFolder_()`.

- [ ] **Step 4: Remove legacy IDs and migration-only fallback**

Remove the `DB_CONFIG` ID object and all runtime reads. Remove code that can copy IDs from `DB_CONFIG`; retain only a no-op diagnostic migration response if operations require the function name.

Search:

```bash
rg -n "DB_CONFIG|userSpreadsheetId|operationSpreadsheetId|rootFolderId" src scripts
```

Expected: no production runtime reference.

- [ ] **Step 5: Run focused and smoke tests**

```bash
node scripts/test-connection-profile.js
node scripts/test-connection-candidates.js
node scripts/test-settings-connections.js
node scripts/test-auth-iam.js
node scripts/test-settings.js
node scripts/test-settings-fsd-home.js
node scripts/test-api-contract-v1-settings.js
node scripts/test-user-db-schema-alignment.js
node scripts/test-operation-business-key-integrity.js
node scripts/test-operation-user-fk-semester-normalization.js
node scripts/test-frontend-api-mapping.js
node scripts/test-project-architecture.js
```

Expected: all PASS.

In the Apps Script development deployment verify invalid URLs preserve old cards, operation DB replacement redirects Accounting, invalid UserDB loses no admin access, valid UserDB rotates login cache, non-writable folders fail, writable folders serve uploads, and no disconnect/year/profile-list controls appear.

- [ ] **Step 6: Commit**

```bash
git diff --check
git add src/backend/app/config/config.gs src/backend/app/config/connection_profile.gs src/backend/core/db/sheets.gs scripts/test-connection-profile.js scripts/test-project-architecture.js
git commit -m "refactor: cut over resource connections to script properties"
```

---

## Final Verification

- [ ] Run whitespace validation:

```bash
git diff --check main...HEAD
```

Expected: no output.

- [ ] Run every Node contract test:

```bash
for test_file in scripts/test-*.js; do
  node "$test_file"
done
```

Expected: every script exits 0.

- [ ] Run Settings and naming verification:

```bash
node scripts/verify-settings-architecture.js
node scripts/verify-public-api-naming.js
node scripts/verify-internal-function-naming.js
```

Expected: all PASS.

- [ ] Review the final diff:

```bash
git diff --stat main...HEAD
git diff main...HEAD -- src/backend/app/config src/backend/core/db src/backend/core/auth src/backend/domains/iam src/frontend/pages/settings_home src/frontend/entities/iam/api scripts
```

Confirm no ID literals, disconnect API/UI, year/profile list, long validation lock, or auth-cache reuse after UserDB replacement.