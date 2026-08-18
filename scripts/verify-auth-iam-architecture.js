var fs = require('fs');
var path = require('path');

var ROOT = path.resolve(__dirname, '..');
var SERVER_ROOT = path.join(ROOT, 'src', '000_server');
var AUTH_ROOT = path.join(SERVER_ROOT, '030_auth');
var IAM_ROOT = path.join(SERVER_ROOT, '040_iam');
var LOGIN_ROOT = path.join(SERVER_ROOT, '040_login');
var failures = [];

function normalize_(value) {
  return value.replace(/\\/g, '/');
}

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

function requireFile_(base, relativePath, label) {
  var target = path.join(base, relativePath);
  if (!fs.existsSync(target)) {
    failures.push('Missing ' + label + ' architecture file: ' + relativePath);
    return;
  }
  if (!fs.readFileSync(target, 'utf8').trim()) {
    failures.push('Empty ' + label + ' architecture file: ' + relativePath);
  }
}

function forbidFile_(relativePath) {
  if (fs.existsSync(path.join(SERVER_ROOT, relativePath))) {
    failures.push('Legacy Auth/IAM file still exists: ' + relativePath);
  }
}

function requireFunctionIn_(functions, name, expected) {
  var locations = functions[name] || [];
  if (locations.length !== 1 || locations[0] !== expected) {
    failures.push('Function ownership mismatch: ' + name + ' expected ' + expected + ', found ' + (locations.length ? locations.join(', ') : 'none'));
  }
}

var requiredAuthFiles = [
  'auth_api.gs',
  'auth_context.gs',
  'auth_session.gs',
  'auth_cache.gs'
];
var requiredIamFiles = [
  '041_users/users_query_service.gs',
  '041_users/users_sheet_dao.gs',
  '042_roles/roles_query_service.gs',
  '042_roles/roles_sheet_dao.gs',
  '042_roles/user_roles_sheet_dao.gs',
  '043_permissions/permissions_query_service.gs',
  '043_permissions/permissions_access_service.gs',
  '043_permissions/permissions_sheet_dao.gs',
  '043_permissions/role_permissions_sheet_dao.gs'
];

requiredAuthFiles.forEach(function (file) { requireFile_(AUTH_ROOT, file, 'Auth'); });
requiredIamFiles.forEach(function (file) { requireFile_(IAM_ROOT, file, 'IAM'); });

[
  '030_auth/users.gs',
  '030_auth/roles.gs',
  '030_auth/permissions.gs',
  '040_login/login_api.gs',
  '040_login/login_cache.gs',
  '040_login/login_context.gs',
  '040_login/login_session.gs'
].forEach(forbidFile_);

if (listGsFiles_(LOGIN_ROOT).length) {
  failures.push('Legacy Login directory still contains .gs files: src/000_server/040_login');
}

var sourceFiles = listGsFiles_(AUTH_ROOT).concat(listGsFiles_(IAM_ROOT));
var functions = collectFunctions_(sourceFiles);

var ownership = {
  api_checkLogin: '030_auth/auth_api.gs',
  api_getCurrentUser: '030_auth/auth_api.gs',
  api_getMyPermissions: '030_auth/auth_api.gs',
  getActiveUserEmailFromSession_: '030_auth/auth_session.gs',
  getCachedLoginContext_: '030_auth/auth_cache.gs',
  cacheLoginContext_: '030_auth/auth_cache.gs',
  invalidateLoginContextCache_: '030_auth/auth_cache.gs',
  buildLoginContextCacheKey_: '030_auth/auth_cache.gs',
  getSessionUserContext_: '030_auth/auth_context.gs',
  buildSessionUserContextFromDb_: '030_auth/auth_context.gs',
  requireLoginContext_: '030_auth/auth_context.gs',
  listUserRows_: '040_iam/041_users/users_sheet_dao.gs',
  findUserRowByEmail_: '040_iam/041_users/users_query_service.gs',
  mapUserDto_: '040_iam/041_users/users_query_service.gs',
  listRoleRows_: '040_iam/042_roles/roles_sheet_dao.gs',
  listUserRoleRows_: '040_iam/042_roles/user_roles_sheet_dao.gs',
  buildRolesById_: '040_iam/042_roles/roles_query_service.gs',
  buildActiveRoleIdsByEmail_: '040_iam/042_roles/roles_query_service.gs',
  mapRoleDto_: '040_iam/042_roles/roles_query_service.gs',
  summarizeRoleForUser_: '040_iam/042_roles/roles_query_service.gs',
  isAdminRoleSet_: '040_iam/042_roles/roles_query_service.gs',
  listPermissionRows_: '040_iam/043_permissions/permissions_sheet_dao.gs',
  listRolePermissionRows_: '040_iam/043_permissions/role_permissions_sheet_dao.gs',
  mapPermissionDto_: '040_iam/043_permissions/permissions_query_service.gs',
  buildPermissionsById_: '040_iam/043_permissions/permissions_query_service.gs',
  buildPermissionIdsByRoleId_: '040_iam/043_permissions/permissions_query_service.gs',
  actionToPermissionKey_: '040_iam/043_permissions/permissions_query_service.gs',
  permissionScreenId_: '040_iam/043_permissions/permissions_query_service.gs',
  buildPermissionTreeFromDb_: '040_iam/043_permissions/permissions_query_service.gs',
  buildPermissionsByRoleFromDb_: '040_iam/043_permissions/permissions_query_service.gs',
  buildUserPermissionsFromDb_: '040_iam/043_permissions/permissions_query_service.gs',
  buildMenusFromPermissions_: '040_iam/043_permissions/permissions_query_service.gs',
  requirePermission_: '040_iam/043_permissions/permissions_access_service.gs',
  resolveRequiredPermissionScreenId_: '040_iam/043_permissions/permissions_access_service.gs',
  throwPermissionError_: '040_iam/043_permissions/permissions_access_service.gs'
};

Object.keys(ownership).forEach(function (name) {
  requireFunctionIn_(functions, name, ownership[name]);
});

Object.keys(functions).forEach(function (name) {
  if (functions[name].length > 1) {
    failures.push('Duplicate Auth/IAM function: ' + name + ' in ' + functions[name].join(', '));
  }
});

listGsFiles_(IAM_ROOT).forEach(function (file) {
  var source = fs.readFileSync(file, 'utf8');
  var relative = normalize_(path.relative(SERVER_ROOT, file));
  if (/\bgetSessionUserContext_\b|\brequireLoginContext_\b|\bapi_checkLogin\b|\bapi_getCurrentUser\b|\bapi_getMyPermissions\b/.test(source)) {
    failures.push('IAM must not depend on Auth: ' + relative);
  }
  if (/\bgetSettingsPermissionsData_\b|\bgetSettingsUsersData_\b|\bgetSettingsRolesData_\b/.test(source)) {
    failures.push('IAM must not depend on Settings: ' + relative);
  }
  if (/sheetInsert_|sheetUpdateById_|append[A-Za-z_$]*Row_|update[A-Za-z_$]*Row_|DriveApp\.create|createFile\s*\(/.test(source)) {
    failures.push('IAM read/access files must not perform writes: ' + relative);
  }
});

listGsFiles_(AUTH_ROOT).forEach(function (file) {
  var source = fs.readFileSync(file, 'utf8');
  var relative = normalize_(path.relative(SERVER_ROOT, file));
  if (/\bgetSettingsPermissionsData_\b|\bgetSettingsUsersData_\b|\bgetSettingsRolesData_\b/.test(source)) {
    failures.push('Auth must not depend on Settings: ' + relative);
  }
  if (/\bopenUserSpreadsheet_\b|\breadTableRows_\b/.test(source)) {
    failures.push('Auth must not directly read UserDB Sheets: ' + relative);
  }
});

var daoTables = {
  '040_iam/041_users/users_sheet_dao.gs': 'users',
  '040_iam/042_roles/roles_sheet_dao.gs': 'roles',
  '040_iam/042_roles/user_roles_sheet_dao.gs': 'userRoles',
  '040_iam/043_permissions/permissions_sheet_dao.gs': 'permissions',
  '040_iam/043_permissions/role_permissions_sheet_dao.gs': 'rolePermissions'
};
var iamTables = ['users', 'roles', 'userRoles', 'permissions', 'rolePermissions'];
Object.keys(daoTables).forEach(function (relative) {
  var absolute = path.join(SERVER_ROOT, relative);
  if (!fs.existsSync(absolute)) return;
  var source = fs.readFileSync(absolute, 'utf8');
  var expectedTable = daoTables[relative];
  if (source.indexOf("getUserDbTableSchema_('" + expectedTable + "')") === -1) {
    failures.push('IAM DAO missing owned table schema: ' + relative + ' -> ' + expectedTable);
  }
  iamTables.forEach(function (table) {
    if (table === expectedTable) return;
    if (source.indexOf("getUserDbTableSchema_('" + table + "')") !== -1) {
      failures.push('IAM DAO accesses another table: ' + relative + ' -> ' + table);
    }
  });
});

if (failures.length) {
  failures.forEach(function (failure) { console.error(failure); });
  process.exitCode = 1;
} else {
  console.log('Auth/IAM architecture verification passed.');
}
