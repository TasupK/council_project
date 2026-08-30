// 1. UserDB 무결성 검증 API
function api_checkUserDbIntegrity() {
  try {
    return okResponse_(validateUserDbIntegrity_());
  } catch (e) {
    console.error('Failed to check UserDB integrity.', e);
    return failResponse_('USER_DB_INTEGRITY_ERROR', 'UserDB 무결성 검증에 실패했습니다.');
  }
}

// 2. UserDB 핵심 테이블 무결성 검증
function validateUserDbIntegrity_() {
  var schema = getUserDbSchema_();
  var tables = readUserDbIntegrityTables_(schema);
  var issues = [];

  issues = issues.concat(validateUserDbPrimaryKeys_(schema, tables));
  issues = issues.concat(validateUserDbForeignKeys_(schema, tables));

  return {
    valid: issues.length === 0,
    issueCount: issues.length,
    issues: issues
  };
}

// 3. 로그인 사용자와 연결된 UserDB 참조 무결성 검증
function validateLoginUserDbIntegrity_(email, roleIds) {
  var schema = getUserDbSchema_();
  var tables = readUserDbIntegrityTables_(schema);
  var normalizedEmail = normalizeIntegrityValue_(email);
  var issues = [];

  issues = issues.concat(validateLoginUserRoleReferences_(schema, tables, normalizedEmail));
  issues = issues.concat(validateLoginRolePermissionReferences_(schema, tables, roleIds));

  return {
    valid: issues.length === 0,
    issueCount: issues.length,
    issues: issues
  };
}

function validateLoginUserRoleReferences_(schema, tables, normalizedEmail) {
  var userRoles = schema.userRoles;
  var fields = userRoles.fields;
  var rows = tables.userRoles.filter(function (row) {
    return normalizeIntegrityValue_(row[fields.email]) === normalizedEmail;
  });
  var issues = [];

  issues = issues.concat(validateForeignKeys_(userRoles.name, rows, fields.email, schema.users.name, tables.users, schema.users.fields.email));
  issues = issues.concat(validateForeignKeys_(userRoles.name, rows, fields.roleId, schema.roles.name, tables.roles, schema.roles.fields.id));
  return issues;
}

function validateLoginRolePermissionReferences_(schema, tables, roleIds) {
  var rolePermissions = schema.rolePermissions;
  var fields = rolePermissions.fields;
  var roleIdIndex = {};
  var rows;
  var issues = [];
  (roleIds || []).forEach(function (roleId) { roleIdIndex[normalizeIntegrityValue_(roleId)] = true; });
  rows = tables.rolePermissions.filter(function (row) { return !!roleIdIndex[normalizeIntegrityValue_(row[fields.roleId])]; });
  issues = issues.concat(validateForeignKeys_(rolePermissions.name, rows, fields.roleId, schema.roles.name, tables.roles, schema.roles.fields.id));
  issues = issues.concat(validateForeignKeys_(rolePermissions.name, rows, fields.permissionId, schema.permissions.name, tables.permissions, schema.permissions.fields.id));
  return issues;
}

function readUserDbIntegrityTables_(schema) {
  var tables = {};
  Object.keys(schema).forEach(function (tableKey) { tables[tableKey] = readUserDbIntegrityTableRows_(tableKey); });
  return tables;
}

function readUserDbIntegrityTableRows_(tableKey) {
  if (tableKey === 'users') return listUserRows_();
  if (tableKey === 'departments') return listDepartmentRows_();
  if (tableKey === 'roles') return listRoleRows_();
  if (tableKey === 'permissions') return listPermissionRows_();
  if (tableKey === 'userRoles') return listUserRoleRows_();
  if (tableKey === 'rolePermissions') return listRolePermissionRows_();
  throw new Error('UserDB 검증 대상 테이블을 찾을 수 없습니다: ' + tableKey);
}

function validateUserDbPrimaryKeys_(schema, tables) {
  var issues = [];
  Object.keys(schema).forEach(function (tableKey) {
    var table = schema[tableKey];
    var primaryKeyColumns = resolveUserDbFieldColumns_(table, table.primaryKey);
    issues = issues.concat(validateRequiredValues_(table.name, tables[tableKey], primaryKeyColumns));
    issues = issues.concat(validateDuplicateKeys_(table.name, tables[tableKey], primaryKeyColumns));
  });
  return issues;
}

function validateUserDbForeignKeys_(schema, tables) {
  var issues = [];
  Object.keys(schema).forEach(function (tableKey) {
    var table = schema[tableKey];
    table.foreignKeys.forEach(function (foreignKey) {
      var refTable = schema[foreignKey.refTable];
      var column = resolveUserDbFieldColumn_(table, foreignKey.field);
      var refColumn = resolveUserDbFieldColumn_(refTable, foreignKey.refField);
      issues = issues.concat(validateForeignKeys_(table.name, tables[tableKey], column, refTable.name, tables[foreignKey.refTable], refColumn));
    });
  });
  return issues;
}

function resolveUserDbFieldColumns_(table, fieldKeys) { return fieldKeys.map(function (fieldKey) { return resolveUserDbFieldColumn_(table, fieldKey); }); }
function resolveUserDbFieldColumn_(table, fieldKey) { return table.fields[fieldKey] || fieldKey; }

function validateRequiredValues_(tableName, rows, columns) {
  var issues = [];
  rows.forEach(function (row) {
    columns.forEach(function (column) {
      if (!normalizeTextValue_(row[column])) issues.push(buildIntegrityIssue_('REQUIRED_VALUE_MISSING', tableName, row, column, '필수값이 비어 있습니다.'));
    });
  });
  return issues;
}

function validateDuplicateKeys_(tableName, rows, columns) {
  var issues = [];
  var seen = {};
  rows.forEach(function (row) {
    var key = buildIntegrityKey_(row, columns);
    if (!key) return;
    if (!seen[key]) { seen[key] = row; return; }
    issues.push(buildIntegrityIssue_('DUPLICATE_KEY', tableName, row, columns.join('+'), '중복된 키가 있습니다.', { key: key }));
  });
  return issues;
}

function validateForeignKeys_(tableName, rows, column, refTableName, refRows, refColumn) {
  var issues = [];
  var refIndex = buildIntegrityIndex_(refRows, refColumn);
  rows.forEach(function (row) {
    var value = normalizeIntegrityValue_(row[column]);
    if (!value) return;
    if (!refIndex[value]) issues.push(buildIntegrityIssue_('FOREIGN_KEY_NOT_FOUND', tableName, row, column, '참조 대상이 없습니다.', { value: value, refTable: refTableName, refColumn: refColumn }));
  });
  return issues;
}

function buildIntegrityIndex_(rows, column) {
  var index = {};
  rows.forEach(function (row) { var value = normalizeIntegrityValue_(row[column]); if (value) index[value] = true; });
  return index;
}

function buildIntegrityKey_(row, columns) {
  var values = columns.map(function (column) { return normalizeIntegrityValue_(row[column]); });
  if (values.some(function (value) { return !value; })) return '';
  return values.join('|');
}

function normalizeIntegrityValue_(value) { return normalizeTextValue_(value).toLowerCase(); }

function buildIntegrityIssue_(code, tableName, row, column, message, extra) {
  return Object.assign({ code: code, table: tableName, rowNumber: row._rowNumber || '', column: column, message: message }, extra || {});
}
