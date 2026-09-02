var assert = require('assert');
var fs = require('fs');
var path = require('path');
var vm = require('vm');

var ROOT = path.resolve(__dirname, '..');

function load_(context, relativePath) {
  var source = fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
  vm.runInContext(source, context, { filename: relativePath });
}

function plain_(value) {
  return JSON.parse(JSON.stringify(value));
}

function createHarness_() {
  var values = {};
  var setPropertiesCalls = [];
  var lockState = { waits: 0, releases: 0 };
  var store = {
    getProperty: function (key) {
      return Object.prototype.hasOwnProperty.call(values, key) ? values[key] : null;
    },
    getProperties: function () {
      return Object.assign({}, values);
    },
    setProperty: function (key, value) {
      values[key] = String(value);
      return store;
    },
    setProperties: function (entries) {
      setPropertiesCalls.push(Object.assign({}, entries));
      Object.keys(entries).forEach(function (key) {
        values[key] = String(entries[key]);
      });
      return store;
    }
  };
  var context = vm.createContext({
    console: console,
    Object: Object,
    Array: Array,
    String: String,
    Number: Number,
    Boolean: Boolean,
    JSON: JSON,
    Error: Error,
    PropertiesService: {
      getScriptProperties: function () { return store; }
    },
    LockService: {
      getScriptLock: function () {
        return {
          waitLock: function (milliseconds) {
            assert.strictEqual(milliseconds, 5000);
            lockState.waits += 1;
          },
          releaseLock: function () {
            lockState.releases += 1;
          }
        };
      }
    },
    getCurrentIsoDateTime_: function () { return '2026-09-02T12:34:56.000Z'; },
    normalizeEmail_: function (value) { return String(value || '').trim().toLowerCase(); }
  });
  return {
    context: context,
    values: values,
    setPropertiesCalls: setPropertiesCalls,
    lockState: lockState
  };
}

function testProfileDefaultsAndMissingResource_() {
  var harness = createHarness_();
  load_(harness.context, 'src/backend/app/config/connection_profile.gs');

  assert.deepStrictEqual(plain_(harness.context.getConnectionProfile_()), {
    operationDbId: '',
    userDbId: '',
    rootFolderId: '',
    revision: 0,
    resources: {
      operationDb: { id: '', connected: false, updatedAt: '', updatedBy: '' },
      userDb: { id: '', connected: false, updatedAt: '', updatedBy: '' },
      rootFolder: { id: '', connected: false, updatedAt: '', updatedBy: '' }
    }
  });
  assert.throws(function () {
    harness.context.requireConnectionResourceId_('operationDb');
  }, function (error) {
    return error.code === 'NOT_CONNECTED' && error.details.resource === 'operationDb';
  });
}

function testOptimisticReplacementAndMetadata_() {
  var harness = createHarness_();
  load_(harness.context, 'src/backend/app/config/connection_profile.gs');

  var saved = harness.context.replaceConnectionResource_(
    'operationDb',
    ' operation-2 ',
    ' Admin@Example.com ',
    0
  );

  assert.strictEqual(saved.operationDbId, 'operation-2');
  assert.strictEqual(saved.revision, 1);
  assert.strictEqual(harness.values.OPERATION_DB_ID_UPDATED_AT, '2026-09-02T12:34:56.000Z');
  assert.strictEqual(harness.values.OPERATION_DB_ID_UPDATED_BY, 'admin@example.com');
  assert.strictEqual(harness.values.LOGIN_CONTEXT_CACHE_GENERATION, undefined);
  assert.strictEqual(harness.lockState.waits, 1);
  assert.strictEqual(harness.lockState.releases, 1);

  assert.throws(function () {
    harness.context.replaceConnectionResource_(
      'userDb',
      'user-2',
      'admin@example.com',
      0
    );
  }, function (error) {
    return error.code === 'CONNECTION_CHANGED' &&
      error.details.expectedRevision === 0 &&
      error.details.actualRevision === 1;
  });
  assert.strictEqual(harness.values.USER_DB_ID, undefined);
  assert.strictEqual(harness.lockState.releases, 2);
}

function testUserDbReplacementAdvancesCacheGenerationAtomically_() {
  var harness = createHarness_();
  load_(harness.context, 'src/backend/app/config/connection_profile.gs');
  harness.values.LOGIN_CONTEXT_CACHE_GENERATION = '7';

  var saved = harness.context.replaceConnectionResource_(
    'userDb',
    'user-2',
    'admin@example.com',
    0
  );

  assert.strictEqual(saved.userDbId, 'user-2');
  assert.strictEqual(harness.values.LOGIN_CONTEXT_CACHE_GENERATION, '8');
  assert.strictEqual(harness.setPropertiesCalls.length, 1);
  assert.deepStrictEqual(harness.setPropertiesCalls[0], {
    USER_DB_ID: 'user-2',
    USER_DB_ID_UPDATED_AT: '2026-09-02T12:34:56.000Z',
    USER_DB_ID_UPDATED_BY: 'admin@example.com',
    CONNECTION_PROFILE_REVISION: '1',
    LOGIN_CONTEXT_CACHE_GENERATION: '8'
  });

  harness.context.replaceConnectionResource_(
    'rootFolder',
    'folder-2',
    'admin@example.com',
    saved.revision
  );
  assert.strictEqual(harness.values.LOGIN_CONTEXT_CACHE_GENERATION, '8');
}

function testReplacementRejectsEmptyIdWithoutChangingProfile_() {
  var harness = createHarness_();
  load_(harness.context, 'src/backend/app/config/connection_profile.gs');
  harness.values.OPERATION_DB_ID = 'operation-1';
  harness.values.CONNECTION_PROFILE_REVISION = '4';

  assert.throws(function () {
    harness.context.replaceConnectionResource_(
      'operationDb',
      '   ',
      'admin@example.com',
      4
    );
  }, function (error) {
    return error.code === 'INVALID_CONNECTION_RESOURCE_ID' &&
      error.details.resource === 'operationDb';
  });
  assert.strictEqual(harness.values.OPERATION_DB_ID, 'operation-1');
  assert.strictEqual(harness.values.CONNECTION_PROFILE_REVISION, '4');
  assert.strictEqual(harness.setPropertiesCalls.length, 0);
  assert.strictEqual(harness.lockState.waits, 0);
}

testProfileDefaultsAndMissingResource_();
testOptimisticReplacementAndMetadata_();
testUserDbReplacementAdvancesCacheGenerationAtomically_();
testReplacementRejectsEmptyIdWithoutChangingProfile_();
console.log('Connection profile repository contract: PASS');
