var assert = require('assert');
var fs = require('fs');
var path = require('path');
var vm = require('vm');

var ROOT = path.resolve(__dirname, '..');
var file = path.join(ROOT, 'src/000_server/040_iam/043_permissions/permissions_query_service.gs');
var context = vm.createContext({
  console: console,
  String: String, Object: Object, Array: Array,
  SETTINGS_PERMISSION_COLUMNS: [
    { key: 'menu' }, { key: 'view' }, { key: 'edit' }, { key: 'approve' }, { key: 'export' }
  ],
  listPermissionRows_: function () { return []; },
  listRolePermissionRows_: function () { return []; },
  getUserDbFields_: function () { return {}; },
  normalizeTextValue_: function (value) { return String(value || ''); },
  isTruthyValue_: function (value) { return !!value; }
});
vm.runInContext(fs.readFileSync(file, 'utf8'), context, { filename: file });

context.buildPermissionsById_ = function () {
  return { P: { id: 'P', area: '행사', action: '수정', name: '행사 수정', status: 'active' } };
};
context.buildPermissionIdsByRoleId_ = function () { return { ROLE: ['P'] }; };

var byRole = context.buildPermissionsByRoleFromDb_();
assert.strictEqual(byRole.ROLE.perm_P.edit, true);
assert.strictEqual(byRole.ROLE.perm_P.menu, false, 'edit grant must not rewrite the semantic menu bit');

context.buildPermissionTreeFromDb_ = function () {
  return [{ id: 'area_행사', name: '행사', group: '행사', children: [{ id: 'perm_P' }] }];
};
var menus = context.buildMenusFromPermissions_({
  perm_P: { menu: false, view: false, edit: true, approve: false, export: false }
});
assert.strictEqual(menus.length, 1, 'usable edit grant must still make the domain navigable');

console.log('IAM menu semantics contract passed.');
