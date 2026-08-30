var assert = require('assert');
var fs = require('fs');
var path = require('path');
var ROOT = path.resolve(__dirname, '..');

assert.ok(!fs.existsSync(path.join(ROOT, 'src', '300_settings')), 'legacy src/300_settings must be removed after all Settings routes migrate to FSD');
[
  'src/frontend/pages/settings_home/Settings_Home.html',
  'src/frontend/pages/settings_users/Settings_Users.html',
  'src/frontend/pages/settings_roles/Settings_Roles.html',
  'src/frontend/pages/settings_permissions/Settings_Permissions.html',
  'src/frontend/pages/settings_departments/Settings_Departments.html',
  'src/frontend/widgets/settings_shell/Settings_Styles.html',
  'src/frontend/widgets/settings_shell/settings_shell_js.html',
  'src/frontend/entities/iam/api/settings_client_js.html'
].forEach(function (relativePath) {
  assert.ok(fs.existsSync(path.join(ROOT, relativePath)), 'missing migrated Settings asset: ' + relativePath);
});
console.log('Settings legacy cleanup contract: PASS');
