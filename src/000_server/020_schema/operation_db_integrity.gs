// 1. 운영 DB 무결성 검증 API
function api_checkOperationDbIntegrity() {
  try {
    return okResponse_(validateOperationDbIntegrity_());
  } catch (e) {
    console.error('Failed to check operation DB integrity.', e);
    return failResponse_('OPERATION_DB_INTEGRITY_ERROR', '운영 DB 무결성 검증에 실패했습니다.');
  }
}

// 2. 운영 DB 전체 검증 실행
function validateOperationDbIntegrity_() {
  var schema = getOperationDbSchema_();
  var spreadsheet = openOperationSpreadsheet_();
  var result = readOperationDbIntegrityTables_(spreadsheet, schema);
  var issues = result.issues;

  issues = issues.concat(validateOperationDbHeaders_(schema, result.headers));
  issues = issues.concat(validateOperationDbPrimaryKeys_(schema, result.tables));
  issues = issues.concat(validateOperationDbForeignKeys_(schema, result.tables));
  issues = issues.concat(validateOperationDbBusinessKeys_(schema, result.tables));
  issues = issues.concat(validateOperationDbReferenceRules_(schema, result.tables));

  return {
    valid: issues.length === 0,
    issueCount: issues.length,
    tableCount: Object.keys(schema).length,
    issues: issues
  };
}

// 3. 운영 DB 검증 대상 시트 조회
function readOperationDbIntegrityTables_(spreadsheet, schema) {
  var tables = {};
  var headers = {};
  var issues = [];

  Object.keys(schema).forEach(function (tableKey) {
    var table = schema[tableKey];
    var sheet = spreadsheet.getSheetByName(table.sheetName);
    var values;

    if (!sheet) {
      tables[tableKey] = [];
      headers[tableKey] = [];
      issues.push(buildIntegrityIssue_('SHEET_NOT_FOUND', table.name, {}, '', '시트 탭을 찾을 수 없습니다.'));
      return;
    }

    values = sheet.getDataRange().getValues();
    headers[tableKey] = values.length ? values[0].map(function (value) { return String(value || '').trim(); }) : [];
    tables[tableKey] = readTableRows_(spreadsheet, table.sheetName);
  });

  return { tables: tables, headers: headers, issues: issues };
}

// 4. 시트 헤더와 명세서 필드 일치 검증
function validateOperationDbHeaders_(schema, headers) {
  var issues = [];

  Object.keys(schema).forEach(function (tableKey) {
    var table = schema[tableKey];
    var actualHeaders = headers[tableKey] || [];

    Object.keys(table.fields).map(function (fieldKey) {
      return table.fields[fieldKey];
    }).forEach(function (header) {
      if (actualHeaders.indexOf(header) === -1) {
        issues.push(buildIntegrityIssue_('HEADER_NOT_FOUND', table.name, {}, header, '명세서에 정의된 컬럼이 없습니다.'));
      }
    });
  });

  return issues;
}

// 5. PK 필수값과 중복 검증
function validateOperationDbPrimaryKeys_(schema, tables) {
  var issues = [];

  Object.keys(schema).forEach(function (tableKey) {
    var table = schema[tableKey];
    var primaryKeyColumns = resolveOperationDbFieldColumns_(table, table.primaryKey);
    issues = issues.concat(validateRequiredValues_(table.name, tables[tableKey], primaryKeyColumns));
    issues = issues.concat(validateDuplicateKeys_(table.name, tables[tableKey], primaryKeyColumns));
  });

  return issues;
}

// 6. 운영 DB 내부 및 UserDB 교차 FK 검증
function validateOperationDbForeignKeys_(schema, tables) {
  var userSchema = getUserDbSchema_();
  var userTables = {};
  var issues = [];

  Object.keys(schema).forEach(function (tableKey) {
    schema[tableKey].foreignKeys.forEach(function (foreignKey) {
      var reference = resolveOperationDbReference_(foreignKey, schema, tables, userSchema, userTables);
      issues = issues.concat(validateForeignKeys_(
        schema[tableKey].name,
        tables[tableKey],
        resolveOperationDbFieldColumn_(schema[tableKey], foreignKey.field),
        reference.table.name,
        reference.rows,
        reference.column
      ));
    });
  });

  return issues;
}

// 7. 업무상 unique여야 하는 secondary key 중복 검증
function validateOperationDbBusinessKeys_(schema, tables) {
  var rules = [
    { tableKey: 'eventForms', fields: ['eventId'] },
    { tableKey: 'feePayments', fields: ['applicationId'] },
    { tableKey: 'feeRefunds', fields: ['requestId'] },
    { tableKey: 'eventApplications', fields: ['sourceResponseId'] },
    { tableKey: 'bankTransactions', fields: ['sourceHash'] },
    { tableKey: 'ledger', fields: ['bankTransactionId'] }
  ];
  var issues = [];

  rules.forEach(function (rule) {
    var table = schema[rule.tableKey];
    var seen = {};
    if (!table) return;

    var columns = resolveOperationDbFieldColumns_(table, rule.fields);
    (tables[rule.tableKey] || []).forEach(function (row) {
      var values = columns.map(function (column) {
        return String(row[column] == null ? '' : row[column]).trim().toLowerCase();
      });
      if (values.some(function (value) { return !value; })) return;

      var key = values.join('|');
      if (!seen[key]) {
        seen[key] = true;
        return;
      }

      issues.push({
        code: 'DUPLICATE_BUSINESS_KEY',
        table: table.name,
        rowNumber: row._rowNumber || '',
        column: columns.join('+'),
        businessKey: rule.fields.join('+'),
        key: key,
        message: '중복된 업무키가 있습니다.'
      });
    });
  });

  return issues;
}

// 8. 감사로그 사용자와 학기 허용값 등 명시적 참조 규칙 검증
function validateOperationDbReferenceRules_(schema, tables, userRows) {
  var issues = [];
  var auditTable = schema.businessAuditLogs;
  var semesterTable = schema.semesters;
  var users = userRows || readUserDbIntegrityTableRows_('users');
  var userSchema = getUserDbSchema_();
  var actorColumn = auditTable.fields.actorEmail;
  var userEmailColumn = userSchema.users.fields.email;
  var semesterTypeColumn = semesterTable.fields.type;
  var allowedTypes = semesterTable.allowedTypes || [];

  issues = issues.concat(validateForeignKeys_(
    auditTable.name,
    tables.businessAuditLogs || [],
    actorColumn,
    userSchema.users.name,
    users,
    userEmailColumn
  ));

  (tables.semesters || []).forEach(function (row) {
    var type = String(row[semesterTypeColumn] == null ? '' : row[semesterTypeColumn]).trim();
    if (!type || allowedTypes.indexOf(type) !== -1) return;
    issues.push(buildIntegrityIssue_(
      'INVALID_SEMESTER_TYPE',
      semesterTable.name,
      row,
      semesterTypeColumn,
      '학기구분은 1학기 또는 2학기여야 합니다.',
      { value: type, allowedValues: allowedTypes.slice() }
    ));
  });

  return issues;
}

// 9. FK가 참조할 DB와 테이블 조회
function resolveOperationDbReference_(foreignKey, schema, tables, userSchema, userTables) {
  var table;

  if (foreignKey.refDatabase === 'user') {
    table = userSchema[foreignKey.refTable];
    if (!userTables[foreignKey.refTable]) {
      userTables[foreignKey.refTable] = readUserDbIntegrityTableRows_(foreignKey.refTable);
    }
    return {
      table: table,
      rows: userTables[foreignKey.refTable],
      column: resolveUserDbFieldColumn_(table, foreignKey.refField)
    };
  }

  table = schema[foreignKey.refTable];
  return {
    table: table,
    rows: tables[foreignKey.refTable],
    column: resolveOperationDbFieldColumn_(table, foreignKey.refField)
  };
}

// 10. 스키마 필드키를 운영 DB 시트 컬럼명으로 변환
function resolveOperationDbFieldColumns_(table, fieldKeys) {
  return fieldKeys.map(function (fieldKey) {
    return resolveOperationDbFieldColumn_(table, fieldKey);
  });
}

function resolveOperationDbFieldColumn_(table, fieldKey) {
  return table.fields[fieldKey] || fieldKey;
}
