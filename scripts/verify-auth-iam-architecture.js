var fs = require('fs');
var path = require('path');

var ROOT = path.resolve(__dirname, '..');
var BACKEND_ROOT = path.join(ROOT, 'src', 'backend');
var AUTH_ROOT = path.join(BACKEND_ROOT, 'core', 'auth');
var IAM_ROOT = path.join(BACKEND_ROOT, 'domains', 'iam');
var ROUTING_ROOT = path.join(BACKEND_ROOT, 'app', 'routing');
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
function requireFile_(base, relativePath, label) {
  var target = path.join(base, relativePath);
  if (!fs.existsSync(target)) {
    failures.push('Missing ' + label + ' architecture file: ' + relativePath);
    return;
  }
  if (!fs.readFileSync(target, 'utf8').trim()) failures.push('Empty ' + label + ' architecture file: ' + relativePath);
}
function requireDirectory_(base, relativePath, label) {
  var target = path.join(base, relativePath);
  if (!fs.existsSync(target) || !fs.statSync(target).isDirectory()) failures.push('Missing ' + label + ' architecture directory: ' + relativePath);
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
function requireFunctionIn_(functions, name, expected) {
  var locations = functions[name] || [];
  if (locations.length !== 1 || locations[0] !== expected) {
    failures.push('Function ownership mismatch: ' + name + ' expected ' + expected + ', found ' + (locations.length ? locations.join(', ') : 'none'));
  }
}

['auth_cache.gs', 'auth_context.gs', 'auth_session.gs', 'api_access.gs'].forEach(function (file) {
  requireFile_(AUTH_ROOT, file, 'Auth');
});
requireFile_(ROUTING_ROOT, 'page_access.gs', 'Routing');
['controllers', 'application', 'repositories'].forEach(function (directory) {
  requireDirectory_(IAM_ROOT, directory, 'IAM');
});
[
  'controllers/auth_controller.gs',
  'application/domain_access.gs',
  'application/users_query.gs',
  'application/roles_query.gs',
  'application/permissions_query.gs',
  'application/permissions_access.gs',
  'repositories/users_repository.gs',
  'repositories/roles_repository.gs',
  'repositories/user_roles_repository.gs',
  'repositories/permissions_repository.gs',
  'repositories/role_permissions_repository.gs'
].forEach(function (file) { requireFile_(IAM_ROOT, file, 'IAM'); });

var authFiles = listGsFiles_(AUTH_ROOT);
var iamFiles = listGsFiles_(IAM_ROOT);
var routingFiles = listGsFiles_(ROUTING_ROOT);
var functions = collectFunctions_(authFiles.concat(iamFiles).concat(routingFiles));

var ownership = {
  api_checkLogin: 'domains/iam/controllers/auth_controller.gs',
  api_getCurrentUser: 'domains/iam/controllers/auth_controller.gs',
  api_getMyPermissions: 'domains/iam/controllers/auth_controller.gs',
  readActiveUserEmailFromSession_: 'core/auth/auth_session.gs',
  readCachedLoginContext_: 'core/auth/auth_cache.gs',
  writeLoginContextCache_: 'core/auth/auth_cache.gs',
  invalidateLoginContextCache_: 'core/auth/auth_cache.gs',
  buildLoginContextCacheKey_: 'core/auth/auth_cache.gs',
  getSessionUserContext_: 'core/auth/auth_context.gs',
  buildSessionUserContextFromDb_: 'core/auth/auth_context.gs',
  requireLoginContext_: 'core/auth/auth_context.gs',
  buildDomainAccess_: 'domains/iam/application/domain_access.gs',
  resolvePageDomain_: 'app/routing/page_access.gs',
  canAccessPage_: 'app/routing/page_access.gs',
  listUserRows_: 'domains/iam/repositories/users_repository.gs',
  findUserRowByEmail_: 'domains/iam/application/users_query.gs',
  mapUserDto_: 'domains/iam/application/users_query.gs',
  listRoleRows_: 'domains/iam/repositories/roles_repository.gs',
  listUserRoleRows_: 'domains/iam/repositories/user_roles_repository.gs',
  buildRolesById_: 'domains/iam/application/roles_query.gs',
  buildActiveRoleIdsByEmail_: 'domains/iam/application/roles_query.gs',
  mapRoleDto_: 'domains/iam/application/roles_query.gs',
  buildRoleSummaryForUser_: 'domains/iam/application/roles_query.gs',
  isAdminRoleSet_: 'domains/iam/application/roles_query.gs',
  listPermissionRows_: 'domains/iam/repositories/permissions_repository.gs',
  listRolePermissionRows_: 'domains/iam/repositories/role_permissions_repository.gs',
  mapPermissionDto_: 'domains/iam/application/permissions_query.gs',
  buildPermissionsById_: 'domains/iam/application/permissions_query.gs',
  buildPermissionIdsByRoleId_: 'domains/iam/application/permissions_query.gs',
  mapActionToPermissionKey_: 'domains/iam/application/permissions_query.gs',
  resolvePermissionScreenId_: 'domains/iam/application/permissions_query.gs',
  buildPermissionTreeFromDb_: 'domains/iam/application/permissions_query.gs',
  buildPermissionsByRoleFromDb_: 'domains/iam/application/permissions_query.gs',
  buildUserPermissionsFromDb_: 'domains/iam/application/permissions_query.gs',
  buildMenusFromPermissions_: 'domains/iam/application/permissions_query.gs',
  requirePermission_: 'domains/iam/application/permissions_access.gs',
  resolveRequiredPermissionScreenId_: 'domains/iam/application/permissions_access.gs',
  throwPermissionError_: 'domains/iam/application/permissions_access.gs'
};
Object.keys(ownership).forEach(function (name) { requireFunctionIn_(functions, name, ownership[name]); });

Object.keys(functions).forEach(function (name) {
  var locations = functions[name];
  if (locations.length > 1) failures.push('Duplicate Auth/IAM/routing function: ' + name + ' in ' + locations.join(', '));
  if (/^api_/.test(name)) {
    locations.forEach(function (location) {
      if (location.indexOf('domains/iam/controllers/') !== 0) failures.push('Auth/IAM public API must be owned by IAM controllers: ' + name + ' in ' + location);
    });
  }
});

iamFiles.forEach(function (file) {
  var source = fs.readFileSync(file, 'utf8');
  var relative = normalize_(path.relative(BACKEND_ROOT, file));
  if (relative.indexOf('domains/iam/repositories/') !== 0 && /\b(?:openUserSpreadsheet_|readTableRows_)\s*\(/.test(source)) {
    failures.push('IAM raw UserDB reads must stay in repositories: ' + relative);
  }
});

authFiles.forEach(function (file) {
  var source = fs.readFileSync(file, 'utf8');
  var relative = normalize_(path.relative(BACKEND_ROOT, file));
  if (/\bgetSettingsPermissionsData_\b|\bgetSettingsUsersData_\b|\bgetSettingsRolesData_\b/.test(source)) {
    failures.push('Auth must not depend on Settings: ' + relative);
  }
  if (/\bopenUserSpreadsheet_\b|\breadTableRows_\b|\binsertSheetCrudItem_\b|\bupdateSheetCrudItemById_\b/.test(source)) {
    failures.push('Auth must not directly access UserDB persistence: ' + relative);
  }
  if (/\b(?:accounting|student_fee|event|settings)\b/i.test(source)) {
    failures.push('Core Auth must not know business domains: ' + relative);
  }
});

iamFiles.forEach(function (file) {
  var relative = normalize_(path.relative(IAM_ROOT, file));
  if (relative.indexOf('application/users_query.gs') !== 0 &&
      relative.indexOf('application/roles_query.gs') !== 0 &&
      relative.indexOf('application/permissions_query.gs') !== 0 &&
      relative.indexOf('application/permissions_access.gs') !== 0 &&
      relative.indexOf('application/domain_access.gs') !== 0 &&
      relative.indexOf('repositories/') !== 0) return;
  var source = fs.readFileSync(file, 'utf8');
  if (relative.indexOf('repositories/') !== 0 && /insertSheetCrudItem_|updateSheetCrudItemById_|append[A-Za-z_$]*Row_|update[A-Za-z_$]*Row_/.test(source)) {
    failures.push('IAM read/access application must not perform writes: domains/iam/' + relative);
  }
});

var repositoryTables = {
  'users_repository.gs': 'users',
  'roles_repository.gs': 'roles',
  'user_roles_repository.gs': 'userRoles',
  'permissions_repository.gs': 'permissions',
  'role_permissions_repository.gs': 'rolePermissions'
};
Object.keys(repositoryTables).forEach(function (fileName) {
  var target = path.join(IAM_ROOT, 'repositories', fileName);
  if (!fs.existsSync(target)) return;
  var source = fs.readFileSync(target, 'utf8');
  var expectedTable = repositoryTables[fileName];
  if (source.indexOf("getUserDbTableSchema_('" + expectedTable + "')") === -1) {
    failures.push('IAM repository missing owned table schema: ' + fileName + ' -> ' + expectedTable);
  }
  Object.keys(repositoryTables).forEach(function (otherFile) {
    var otherTable = repositoryTables[otherFile];
    if (otherTable === expectedTable) return;
    if (source.indexOf("getUserDbTableSchema_('" + otherTable + "')") !== -1) {
      failures.push('IAM repository accesses another owned table: ' + fileName + ' -> ' + otherTable);
    }
  });
});

if (failures.length) {
  failures.forEach(function (failure) { console.error(failure); });
  process.exitCode = 1;
} else {
  console.log('Auth/IAM migrated architecture verification passed.');
}
