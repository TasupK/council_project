var fs = require('fs');
var path = require('path');

var ROOT = path.resolve(__dirname, '..');
var SERVER_ROOT = path.join(ROOT, 'src', '000_server');
var SETTINGS_ROOT = path.join(SERVER_ROOT, '070_settings');
var AUTH_ROOT = path.join(SERVER_ROOT, '030_auth');
var IAM_ROOT = path.join(SERVER_ROOT, '040_iam');
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
      functions[match[1]].push(normalize_(path.relative(SERVER_ROOT, file)));
    }
  });
  return functions;
}
function requireFunctionIn_(functions, name, expected) {
  var locations = functions[name] || [];
  if (locations.length !== 1 || locations[0] !== expected) {
    failures.push('Function ownership mismatch: ' + name + ' expected ' + expected + ', found ' + (locations.length ? locations.join(', ') : 'none'));
  }
}

var requiredFiles = [
  '070_common/settings_access.gs', '070_common/settings_shell_query_service.gs',
  '071_users/settings_users_api.gs', '071_users/settings_users_query_service.gs',
  '072_roles/settings_roles_api.gs', '072_roles/settings_roles_query_service.gs',
  '073_permissions/settings_permissions_api.gs', '073_permissions/settings_permissions_query_service.gs'
];
requiredFiles.forEach(function (relative) {
  if (!fs.existsSync(path.join(SETTINGS_ROOT, relative))) failures.push('Missing Settings architecture file: ' + relative);
});
if (fs.existsSync(path.join(SERVER_ROOT, 'settings.gs'))) failures.push('Legacy Settings file still exists: src/000_server/settings.gs');

var sourceFiles = listGsFiles_(SETTINGS_ROOT).concat(listGsFiles_(AUTH_ROOT)).concat(listGsFiles_(IAM_ROOT));
var functions = collectFunctions_(sourceFiles);
var settingsOwnership = {
  getAdminSettingsCurrent_: '070_settings/070_common/settings_access.gs',
  buildSettingsBaseView_: '070_settings/070_common/settings_shell_query_service.gs',
  loadSettingsHomeData: '070_settings/070_common/settings_shell_query_service.gs',
  loadSettingsUsersData: '070_settings/071_users/settings_users_api.gs',
  getSettingsUsersData_: '070_settings/071_users/settings_users_query_service.gs',
  loadSettingsRolesData: '070_settings/072_roles/settings_roles_api.gs',
  getSettingsRolesData_: '070_settings/072_roles/settings_roles_query_service.gs',
  loadSettingsPermissionsData: '070_settings/073_permissions/settings_permissions_api.gs',
  getSettingsPermissionsData_: '070_settings/073_permissions/settings_permissions_query_service.gs'
};
var iamOwnership = {
  actionToPermissionKey_: '040_iam/043_permissions/permissions_query_service.gs',
  permissionScreenId_: '040_iam/043_permissions/permissions_query_service.gs',
  buildPermissionTreeFromDb_: '040_iam/043_permissions/permissions_query_service.gs',
  buildPermissionsByRoleFromDb_: '040_iam/043_permissions/permissions_query_service.gs',
  requirePermission_: '040_iam/043_permissions/permissions_access_service.gs',
  resolveRequiredPermissionScreenId_: '040_iam/043_permissions/permissions_access_service.gs',
  throwPermissionError_: '040_iam/043_permissions/permissions_access_service.gs',
  requireLoginContext_: '030_auth/auth_context.gs'
};
Object.keys(settingsOwnership).forEach(function (name) { requireFunctionIn_(functions, name, settingsOwnership[name]); });
Object.keys(iamOwnership).forEach(function (name) { requireFunctionIn_(functions, name, iamOwnership[name]); });
Object.keys(functions).forEach(function (name) {
  if (functions[name].length > 1) failures.push('Duplicate Settings/Auth/IAM function: ' + name + ' in ' + functions[name].join(', '));
});

listGsFiles_(SETTINGS_ROOT).forEach(function (file) {
  var source = fs.readFileSync(file, 'utf8');
  var relative = normalize_(path.relative(SETTINGS_ROOT, file));
  if (/_query_service\.gs$/.test(relative) && /withOperationWriteLock_|appendOperationTableRow_|updateOperationTableRow_|sheetInsert_|sheetUpdateById_|DriveApp\.create|createFile\s*\(/.test(source)) {
    failures.push('Settings Query Service must be read-only: ' + relative);
  }
  if (/readTableRows_|openUserSpreadsheet_|append[A-Za-z_$]*Row_|update[A-Za-z_$]*Row_/.test(source)) {
    failures.push('Settings must not access UserDB Sheet primitives directly: ' + relative);
  }
});

listGsFiles_(AUTH_ROOT).concat(listGsFiles_(IAM_ROOT)).forEach(function (file) {
  var source = fs.readFileSync(file, 'utf8');
  var relative = normalize_(path.relative(SERVER_ROOT, file));
  if (/\bgetSettingsPermissionsData_\b|\bgetSettingsUsersData_\b|\bgetSettingsRolesData_\b/.test(source)) {
    failures.push('Auth/IAM must not depend on Settings application functions: ' + relative);
  }
});

if (failures.length) {
  failures.forEach(function (failure) { console.error(failure); });
  process.exitCode = 1;
} else {
  console.log('Settings architecture verification passed.');
}
