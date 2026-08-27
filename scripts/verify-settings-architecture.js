var fs = require('fs');
var path = require('path');

var ROOT = path.resolve(__dirname, '..');
var BACKEND_ROOT = path.join(ROOT, 'src', 'backend');
var IAM_ROOT = path.join(BACKEND_ROOT, 'domains', 'iam');
var AUTH_ROOT = path.join(BACKEND_ROOT, 'core', 'auth');
var failures = [];

function normalize_(value) { return value.replace(/\\/g, '/'); }
function listGsFiles_(directory) {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { withFileTypes: true }).reduce(function (files, entry) {
    var target = path.join(directory, entry.name);
    if (entry.isDirectory()) return files.concat(listGsFiles_(target));
    if (/\.gs$/.test(entry.name)) files.push(target);
    return files;
  }, []);
}
function collectFunctions_(files) {
  var functions = {};
  files.forEach(function (file) {
    var source = fs.readFileSync(file, 'utf8');
    var pattern = /function\s+([A-Za-z_$][\w$]*)\s*\(/g;
    var match;
    while ((match = pattern.exec(source)) !== null) {
      if (!functions[match[1]]) functions[match[1]] = [];
      functions[match[1]].push(normalize_(path.relative(BACKEND_ROOT, file)));
    }
  });
  return functions;
}
function requireFile_(relative) {
  var target = path.join(IAM_ROOT, relative);
  if (!fs.existsSync(target)) failures.push('Missing Settings/IAM architecture file: ' + relative);
}
function requireFunctionIn_(functions, name, expected) {
  var locations = functions[name] || [];
  if (locations.length !== 1 || locations[0] !== expected) {
    failures.push('Function ownership mismatch: ' + name + ' expected ' + expected + ', found ' + (locations.length ? locations.join(', ') : 'none'));
  }
}

[
  'controllers/settings_home_controller.gs',
  'controllers/settings_users_controller.gs',
  'controllers/settings_roles_controller.gs',
  'controllers/settings_permissions_controller.gs',
  'application/settings_access.gs',
  'application/settings_users_query.gs',
  'application/settings_roles_query.gs',
  'application/settings_permissions_query.gs',
  'application/permissions_query.gs',
  'application/permissions_access.gs'
].forEach(requireFile_);

var sourceFiles = listGsFiles_(IAM_ROOT).concat(listGsFiles_(AUTH_ROOT));
var functions = collectFunctions_(sourceFiles);
var settingsOwnership = {
  getAdminSettingsCurrent_: 'domains/iam/application/settings_access.gs',
  buildSettingsBaseView_: 'domains/iam/controllers/settings_home_controller.gs',
  api_getSettingsHome: 'domains/iam/controllers/settings_home_controller.gs',
  api_getSettingsUsers: 'domains/iam/controllers/settings_users_controller.gs',
  getSettingsUsersData_: 'domains/iam/application/settings_users_query.gs',
  api_getSettingsRoles: 'domains/iam/controllers/settings_roles_controller.gs',
  getSettingsRolesData_: 'domains/iam/application/settings_roles_query.gs',
  api_getSettingsPermissions: 'domains/iam/controllers/settings_permissions_controller.gs',
  getSettingsPermissionsData_: 'domains/iam/application/settings_permissions_query.gs'
};
var sharedOwnership = {
  mapActionToPermissionKey_: 'domains/iam/application/permissions_query.gs',
  resolvePermissionScreenId_: 'domains/iam/application/permissions_query.gs',
  buildPermissionTreeFromDb_: 'domains/iam/application/permissions_query.gs',
  buildPermissionsByRoleFromDb_: 'domains/iam/application/permissions_query.gs',
  requirePermission_: 'domains/iam/application/permissions_access.gs',
  resolveRequiredPermissionScreenId_: 'domains/iam/application/permissions_access.gs',
  throwPermissionError_: 'domains/iam/application/permissions_access.gs',
  requireLoginContext_: 'core/auth/auth_context.gs'
};
Object.keys(settingsOwnership).forEach(function (name) { requireFunctionIn_(functions, name, settingsOwnership[name]); });
Object.keys(sharedOwnership).forEach(function (name) { requireFunctionIn_(functions, name, sharedOwnership[name]); });
Object.keys(functions).forEach(function (name) {
  if (functions[name].length > 1) failures.push('Duplicate Settings/Auth/IAM function: ' + name + ' in ' + functions[name].join(', '));
});

// Settings public APIs remain controller-owned.
Object.keys(functions).forEach(function (name) {
  if (!/^api_(?:get|create|update|apply).*Settings|^api_getSettings/.test(name)) return;
  functions[name].forEach(function (relative) {
    if (relative.indexOf('domains/iam/controllers/settings_') !== 0) {
      failures.push('Settings public API must be owned by IAM settings controllers: ' + name + ' in ' + relative);
    }
  });
});

// Settings query use cases are read-only and use IAM repositories/query functions rather than raw Sheet primitives.
[
  'application/settings_users_query.gs',
  'application/settings_roles_query.gs',
  'application/settings_permissions_query.gs',
  'application/settings_departments_query.gs'
].forEach(function (relative) {
  var target = path.join(IAM_ROOT, relative);
  if (!fs.existsSync(target)) return;
  var source = fs.readFileSync(target, 'utf8');
  if (/withOperationWriteLock_|appendOperationTableRow_|updateOperationTableRow_|insertSheetCrudItem_|updateSheetCrudItemById_|DriveApp\.create|createFile\s*\(/.test(source)) {
    failures.push('Settings query application must be read-only: ' + relative);
  }
  if (/\b(?:readTableRows_|openUserSpreadsheet_)\s*\(/.test(source)) {
    failures.push('Settings query application must not access UserDB Sheet primitives directly: ' + relative);
  }
});

// Core Auth must not depend on Settings-specific application functions.
listGsFiles_(AUTH_ROOT).forEach(function (file) {
  var source = fs.readFileSync(file, 'utf8');
  var relative = normalize_(path.relative(BACKEND_ROOT, file));
  if (/\bgetSettingsPermissionsData_\b|\bgetSettingsUsersData_\b|\bgetSettingsRolesData_\b|\brequireSettingsCurrent_\b|\bgetAdminSettingsCurrent_\b/.test(source)) {
    failures.push('Core Auth must not depend on Settings application functions: ' + relative);
  }
});

if (fs.existsSync(path.join(ROOT, 'src', '000_server', '070_settings'))) {
  failures.push('Legacy Settings backend directory still exists: src/000_server/070_settings');
}

if (failures.length) {
  failures.forEach(function (failure) { console.error(failure); });
  process.exitCode = 1;
} else {
  console.log('Settings IAM architecture verification passed.');
}
