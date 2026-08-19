const fs = require('fs');
const vm = require('vm');
const assert = require('assert');

const source = fs.readFileSync('src/000_server/020_schema/user_db_schema.gs', 'utf8');
const context = {};
vm.createContext(context);
vm.runInContext(source, context, { filename: 'user_db_schema.gs' });

const schema = context.getUserDbSchema_();

assert.strictEqual(schema.users.fields.active, '활성여부', 'users.active must map to 실제 DB의 활성여부');
assert.ok(!Object.prototype.hasOwnProperty.call(schema.users.fields, 'status'), 'users.status/계정상태 mapping must not remain');

assert.ok(!Object.prototype.hasOwnProperty.call(schema.roles.fields, 'assignedStatus'), '배정상태는 역할이 아니라 사용자역할 관계 속성이어야 한다');
assert.strictEqual(schema.userRoles.fields.assignedStatus, '배정상태');

assert.strictEqual(schema.departments.fields.description, '부서설명');
assert.strictEqual(schema.departments.fields.sortOrder, '표시순서');
assert.ok(!Object.prototype.hasOwnProperty.call(schema.departments.fields, 'type'), '실제 DB에 없는 부서유형을 요구하면 안 된다');

console.log('UserDB schema alignment contract PASS');
