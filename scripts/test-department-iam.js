var fs = require('fs');
var assert = require('assert');

function read(path) { return fs.readFileSync(path, 'utf8'); }

var schema = read('src/backend/core/db/schema/user_db_schema.gs');
var users = read('src/backend/domains/iam/application/users_query.gs');
var integrity = read('src/backend/core/db/schema/user_db_integrity.gs');
var daoPath = 'src/backend/domains/iam/repositories/departments_repository.gs';
var queryPath = 'src/backend/domains/iam/application/departments_query.gs';

assert.ok(schema.includes("departmentId: '부서ID'"), 'users.departmentId schema missing');
assert.ok(schema.includes("departments:"), 'departments table missing');
assert.ok(schema.includes("id: '부서ID'"), 'department id missing');
assert.ok(schema.includes("name: '부서명'"), 'department name missing');
assert.ok(schema.includes("description: '부서설명'"), 'department description missing');
assert.ok(!schema.includes("type: '부서유형'"), 'nonexistent department type must not return');
assert.ok(schema.includes("sortOrder: '표시순서'"), 'department sortOrder missing');
assert.ok(schema.includes("active: '활성여부'"), 'department active missing');
assert.ok(schema.includes("{ field: 'departmentId', refTable: 'departments', refField: 'id' }"), 'department FK missing');
assert.ok(fs.existsSync(daoPath), 'department repository missing');
assert.ok(fs.existsSync(queryPath), 'department query service missing');
var dao = fs.existsSync(daoPath) ? read(daoPath) : '';
var query = fs.existsSync(queryPath) ? read(queryPath) : '';
assert.ok(dao.includes('function listDepartmentRows_'), 'listDepartmentRows_ missing');
assert.ok(query.includes('function mapDepartmentDto_'), 'mapDepartmentDto_ missing');
assert.ok(query.includes('function buildDepartmentsById_'), 'buildDepartmentsById_ missing');
assert.ok(query.includes('function getActiveDepartmentsData_'), 'getActiveDepartmentsData_ missing');
assert.ok(users.includes('departmentId:'), 'user DTO departmentId missing');
assert.ok(users.includes('department:'), 'user DTO department name missing');
assert.ok(integrity.includes("tableKey === 'departments'"), 'integrity Department reader missing');
console.log('Department IAM contract passed.');
