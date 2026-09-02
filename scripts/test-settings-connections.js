var assert = require('assert');
var fs = require('fs');
var path = require('path');
var vm = require('vm');

var ROOT = path.resolve(__dirname, '..');

function load_(context, relativePath) {
  var source = fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
  vm.runInContext(source, context, { filename: relativePath });
}

function createContext_() {
  return vm.createContext({
    console: console,
    Object: Object,
    Array: Array,
    String: String,
    Number: Number,
    Boolean: Boolean,
    JSON: JSON,
    Error: Error,
    ADMIN_ROLE_ID: 'role_admin',
    DB_CONFIG: {
      operationSpreadsheetId: 'operation-legacy',
      userSpreadsheetId: 'user-legacy',
      rootFolderId: 'folder-legacy'
    }
  });
}

function installPropertyHarness_(context, initialValues) {
  var values = Object.assign({}, initialValues || {});
  var writes = [];
  var store = {
    getProperty: function (key) {
      return Object.prototype.hasOwnProperty.call(values, key) ? values[key] : null;
    },
    getProperties: function () { return Object.assign({}, values); },
    setProperties: function (entries) {
      writes.push(Object.assign({}, entries));
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
  context.getCurrentIsoDateTime_ = function () { return '2026-09-02T13:00:00.000Z'; };
  context.normalizeEmail_ = function (value) { return String(value || '').trim().toLowerCase(); };
  return { values: values, writes: writes };
}

function testConnectionManagePermissionGuard_() {
  var context = createContext_();
  context.requireAuthenticatedUserData_ = function () {
    return { isAdmin: true, user: { email: 'admin@example.com' } };
  };
  context.requirePermission_ = function (current, requirement) {
    assert.strictEqual(requirement.id, 'SYSTEM_CONNECTION_MANAGE');
    assert.strictEqual(requirement.action, 'edit');
    if (!current.isAdmin) {
      var error = new Error('forbidden');
      error.code = 'FORBIDDEN';
      throw error;
    }
  };
  load_(context, 'src/backend/domains/iam/application/settings_access.gs');
  assert.strictEqual(context.requireConnectionManageCurrent_().isAdmin, true);

  context.requireAuthenticatedUserData_ = function () {
    return { isAdmin: false, domainAccess: { settings: true }, permissions: { byScreen: {} } };
  };
  assert.throws(function () {
    context.requireConnectionManageCurrent_();
  }, function (error) { return error.code === 'FORBIDDEN'; });
}

function testPermissionSeedIsIdempotent_() {
  var context = createContext_();
  var permissions = [];
  var mappings = [];
  context.normalizeTextValue_ = function (value) { return String(value || '').trim(); };
  context.getUserDbFields_ = function (tableKey) {
    return tableKey === 'permissions'
      ? { id: '권한ID' }
      : { roleId: '역할ID', permissionId: '권한ID' };
  };
  context.listPermissionRows_ = function () { return permissions; };
  context.listRolePermissionRows_ = function () { return mappings; };
  context.insertSheetCrudItem_ = function (database, tableKey, item) {
    assert.strictEqual(database, 'user');
    if (tableKey === 'permissions') {
      permissions.push({ '권한ID': item.id });
    } else {
      mappings.push({ '역할ID': item.roleId, '권한ID': item.permissionId });
    }
  };
  load_(context, 'src/backend/domains/iam/application/settings_access.gs');

  var first = context.ensureSystemConnectionManagePermission_();
  var second = context.ensureSystemConnectionManagePermission_();
  assert.deepStrictEqual(JSON.parse(JSON.stringify(first)), {
    permissionCreated: true,
    mappingCreated: true
  });
  assert.deepStrictEqual(JSON.parse(JSON.stringify(second)), {
    permissionCreated: false,
    mappingCreated: false
  });
  assert.strictEqual(permissions.length, 1);
  assert.strictEqual(mappings.length, 1);
}

function installValidMigrationCandidates_(context) {
  var userSpreadsheet = { id: 'user-legacy' };
  var operationSpreadsheet = { id: 'operation-legacy' };
  var folder = { id: 'folder-legacy' };
  context.openCandidateSpreadsheet_ = function (id, resourceType) {
    return resourceType === 'userDb' ? userSpreadsheet : operationSpreadsheet;
  };
  context.validateUserDbSpreadsheetIntegrity_ = function (spreadsheet) {
    assert.strictEqual(spreadsheet, userSpreadsheet);
    return { valid: true, issues: [], tables: { users: [{ email: 'admin@example.com' }] } };
  };
  context.validateOperationDbSpreadsheetIntegrity_ = function (spreadsheet, userTables) {
    assert.strictEqual(spreadsheet, operationSpreadsheet);
    assert.strictEqual(userTables.users.length, 1);
    return { valid: true, issues: [] };
  };
  context.openCandidateFolder_ = function () { return folder; };
  context.validateRootFolderCandidate_ = function (candidate) {
    assert.strictEqual(candidate, folder);
    return { valid: true, name: 'folder' };
  };
}

function testLegacyMigrationValidatesThenWritesOnce_() {
  var context = createContext_();
  var harness = installPropertyHarness_(context);
  var seedCalls = 0;
  context.ensureSystemConnectionManagePermission_ = function () { seedCalls += 1; };
  installValidMigrationCandidates_(context);
  load_(context, 'src/backend/app/config/connection_profile.gs');

  var first = context.migrateLegacyConnectionProfile_();
  var second = context.migrateLegacyConnectionProfile_();
  assert.strictEqual(first.status, 'migrated');
  assert.strictEqual(second.status, 'already_migrated');
  assert.strictEqual(harness.writes.length, 1);
  assert.deepStrictEqual(harness.writes[0], {
    OPERATION_DB_ID: 'operation-legacy',
    USER_DB_ID: 'user-legacy',
    ROOT_FOLDER_ID: 'folder-legacy',
    CONNECTION_PROFILE_REVISION: '1',
    LOGIN_CONTEXT_CACHE_GENERATION: '0'
  });
  assert.strictEqual(seedCalls, 2);
}

function testLegacyMigrationRejectsPartialAndInvalidStateWithoutWrites_() {
  var partialContext = createContext_();
  var partialHarness = installPropertyHarness_(partialContext, { USER_DB_ID: 'existing-user' });
  partialContext.ensureSystemConnectionManagePermission_ = function () {};
  load_(partialContext, 'src/backend/app/config/connection_profile.gs');
  assert.throws(function () {
    partialContext.migrateLegacyConnectionProfile_();
  }, function (error) { return error.code === 'PARTIAL_CONNECTION_PROFILE'; });
  assert.strictEqual(partialHarness.writes.length, 0);

  var invalidContext = createContext_();
  var invalidHarness = installPropertyHarness_(invalidContext);
  invalidContext.ensureSystemConnectionManagePermission_ = function () {
    throw new Error('permission seeding must wait until validation succeeds');
  };
  installValidMigrationCandidates_(invalidContext);
  invalidContext.validateOperationDbSpreadsheetIntegrity_ = function () {
    return { valid: false, issues: [{ code: 'SHEET_NOT_FOUND' }] };
  };
  load_(invalidContext, 'src/backend/app/config/connection_profile.gs');
  assert.throws(function () {
    invalidContext.migrateLegacyConnectionProfile_();
  }, function (error) { return error.code === 'SCHEMA_INVALID'; });
  assert.strictEqual(invalidHarness.writes.length, 0);
}

function testConnectionUrlParsingAndCandidateFirstReplacement_() {
  var context = createContext_();
  var replaceCalls = [];
  load_(context, 'src/backend/domains/iam/application/settings_connections.gs');
  context.validateOperationDbConnectionCandidate_ = function (id) {
    assert.strictEqual(id, 'operation-new_123');
    return { id: id, name: '새 운영 DB' };
  };
  context.replaceConnectionResource_ = function () {
    replaceCalls.push(Array.prototype.slice.call(arguments));
    return { revision: 6, resources: { operationDb: { id: 'operation-new_123' } } };
  };

  assert.throws(function () {
    context.extractSpreadsheetIdFromUrl_('operation-new_123');
  }, function (error) { return error.code === 'INVALID_RESOURCE_URL'; });
  assert.strictEqual(
    context.extractFolderIdFromUrl_('https://drive.google.com/drive/folders/folder-new_123?usp=sharing'),
    'folder-new_123'
  );

  var result = context.updateSettingsConnection_('operationDb', {
    resourceUrl: 'https://docs.google.com/spreadsheets/d/operation-new_123/edit#gid=0',
    expectedRevision: 5
  }, { user: { email: 'Admin@Example.com' } });
  assert.strictEqual(result.profile.revision, 6);
  assert.deepStrictEqual(replaceCalls[0], [
    'operationDb', 'operation-new_123', 'Admin@Example.com', 5
  ]);
}

function testFailedCandidateValidationPreservesConnection_() {
  var context = createContext_();
  var replaceCalls = 0;
  load_(context, 'src/backend/domains/iam/application/settings_connections.gs');
  context.validateUserDbConnectionCandidate_ = function () {
    var error = new Error('broken schema');
    error.code = 'SCHEMA_INVALID';
    throw error;
  };
  context.replaceConnectionResource_ = function () { replaceCalls += 1; };

  assert.throws(function () {
    context.updateSettingsConnection_('userDb', {
      resourceUrl: 'https://docs.google.com/spreadsheets/d/user-new/edit',
      expectedRevision: 2
    }, { user: { email: 'admin@example.com' } });
  }, function (error) { return error.code === 'SCHEMA_INVALID'; });
  assert.strictEqual(replaceCalls, 0);
}

function testUserDbCandidateMustPreserveCurrentAdministrator_() {
  var context = createContext_();
  context.normalizeEmail_ = function (value) { return String(value || '').trim().toLowerCase(); };
  context.normalizeTextValue_ = function (value) { return String(value || '').trim(); };
  context.isActiveStatus_ = function (value) {
    return value === true || value === '활성' || value === 'active';
  };
  context.isTruthyValue_ = function (value) {
    return value === true || value === 'TRUE' || value === 'true';
  };
  context.getUserDbSchema_ = function () {
    return {
      users: { fields: { email: '이메일', active: '활성' } },
      userRoles: { fields: { email: '이메일', roleId: '역할', assignedStatus: '상태' } },
      roles: { fields: { id: '역할', active: '활성' } },
      permissions: { fields: { id: '권한', active: '활성' } },
      rolePermissions: { fields: { roleId: '역할', permissionId: '권한' } }
    };
  };
  context.openCandidateSpreadsheet_ = function () { return {}; };
  context.openOperationSpreadsheet_ = function () { return {}; };
  context.validateOperationDbSpreadsheetIntegrity_ = function () { return { valid: true, issues: [] }; };
  var candidateTables = {
    users: [{ '이메일': 'admin@example.com', '활성': '활성' }],
    userRoles: [{ '이메일': 'admin@example.com', '역할': 'role_staff', '상태': '활성' }],
    roles: [{ '역할': 'role_staff', '활성': true }],
    permissions: [],
    rolePermissions: []
  };
  context.validateUserDbSpreadsheetIntegrity_ = function () {
    return { valid: true, issues: [], tables: candidateTables };
  };
  load_(context, 'src/backend/domains/iam/application/settings_connections.gs');

  assert.throws(function () {
    context.validateUserDbConnectionCandidate_('user-new', {
      user: { email: 'admin@example.com' }
    });
  }, function (error) { return error.code === 'ADMIN_ACCESS_WOULD_BE_LOST'; });

  candidateTables.userRoles[0]['역할'] = 'role_admin';
  candidateTables.roles[0]['역할'] = 'role_admin';
  assert.strictEqual(
    context.validateUserDbConnectionCandidate_('user-new', {
      user: { email: 'admin@example.com' }
    }).id,
    'user-new'
  );
}

function testSettingsConnectionCardsHideResourceIdentityFromNonManagers_() {
  var context = createContext_();
  context.getConnectionProfile_ = function () {
    return {
      revision: 9,
      resources: {
        operationDb: { id: 'operation-1', connected: true, updatedAt: 'op-time', updatedBy: 'admin@example.com' },
        userDb: { id: 'user-1', connected: true, updatedAt: 'user-time', updatedBy: 'admin@example.com' },
        rootFolder: { id: 'folder-1', connected: true, updatedAt: 'folder-time', updatedBy: 'admin@example.com' }
      }
    };
  };
  context.SpreadsheetApp = {
    openById: function (id) { return { getName: function () { return 'sheet-' + id; } }; }
  };
  context.DriveApp = {
    getFolderById: function (id) { return { getName: function () { return 'folder-' + id; } }; }
  };
  load_(context, 'src/backend/domains/iam/application/settings_connections.gs');

  var adminCards = context.getSettingsConnectionCards_({ isAdmin: true, permissions: { byScreen: {} } });
  assert.strictEqual(adminCards.revision, 9);
  assert.strictEqual(adminCards.operationDb.name, 'sheet-operation-1');
  assert.strictEqual(adminCards.userDb.url, 'https://docs.google.com/spreadsheets/d/user-1/edit');
  assert.strictEqual(adminCards.rootFolder.url, 'https://drive.google.com/drive/folders/folder-1');

  var memberCards = context.getSettingsConnectionCards_({ isAdmin: false, permissions: { byScreen: {} } });
  assert.strictEqual(memberCards.operationDb.url, '');
  assert.strictEqual(memberCards.operationDb.id, '');
  assert.strictEqual(memberCards.operationDb.connected, true);
}

function testConnectionMutationPublicApisUseCanonicalHandler_() {
  var context = createContext_();
  var calls = [];
  context.apiHandler_ = function (options) {
    return { ok: true, data: options.service(options.input || {}) };
  };
  context.requireConnectionManageCurrent_ = function () {
    return { user: { email: 'admin@example.com' } };
  };
  context.updateSettingsConnection_ = function (resourceType, request, current) {
    calls.push({ resourceType: resourceType, request: request, current: current });
    return { resourceType: resourceType };
  };
  load_(context, 'src/backend/domains/iam/controllers/settings_home_controller.gs');

  var request = { resourceUrl: 'https://example.com', expectedRevision: 1 };
  assert.strictEqual(context.api_updateOperationDbConnection(request).data.resourceType, 'operationDb');
  assert.strictEqual(context.api_updateUserDbConnection(request).data.resourceType, 'userDb');
  assert.strictEqual(context.api_updateRootFolderConnection(request).data.resourceType, 'rootFolder');
  assert.deepStrictEqual(calls.map(function (call) { return call.resourceType; }), [
    'operationDb', 'userDb', 'rootFolder'
  ]);
}

testConnectionManagePermissionGuard_();
testPermissionSeedIsIdempotent_();
testLegacyMigrationValidatesThenWritesOnce_();
testLegacyMigrationRejectsPartialAndInvalidStateWithoutWrites_();
testConnectionUrlParsingAndCandidateFirstReplacement_();
testFailedCandidateValidationPreservesConnection_();
testUserDbCandidateMustPreserveCurrentAdministrator_();
testSettingsConnectionCardsHideResourceIdentityFromNonManagers_();
testConnectionMutationPublicApisUseCanonicalHandler_();
console.log('Settings connection security and migration contract: PASS');
