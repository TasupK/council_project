/** 수입지출원장 Sheet DAO */

function ensureLedgerApprovalColumns_() {
  var table = getOperationDbTableSchema_('ledger');
  var sheet = openOperationSpreadsheet_().getSheetByName(table.sheetName);
  if (!sheet) throw new Error(table.sheetName + ' 시트를 찾을 수 없습니다.');
  var lock = LockService.getScriptLock();
  var ownsLock = !lock.hasLock();
  if (ownsLock) lock.waitLock(30000);
  try {
    var headers = readSheetCrudHeaderValues_(sheet);
    var approvalFields = ['approvalStatus', 'approvedByEmail', 'approvedAt', 'rejectionReason'];
    var missingHeaders = approvalFields.map(function (fieldKey) {
      return table.fields[fieldKey];
    }).filter(function (header) {
      return headers.indexOf(header) < 0;
    });
    if (missingHeaders.length) {
      sheet.getRange(1, sheet.getLastColumn() + 1, 1, missingHeaders.length).setValues([missingHeaders]);
      SpreadsheetApp.flush();
      headers = readSheetCrudHeaderValues_(sheet);
    }

    var approvalColumn = headers.indexOf(table.fields.approvalStatus) + 1;
    var rowCount = Math.max(0, sheet.getLastRow() - 1);
    if (!approvalColumn || !rowCount) return;
    var range = sheet.getRange(2, approvalColumn, rowCount, 1);
    var values = range.getValues();
    var changed = false;
    values.forEach(function (row) {
      if (String(row[0] || '').trim()) return;
      row[0] = '승인대기';
      changed = true;
    });
    if (changed) {
      range.setValues(values);
      SpreadsheetApp.flush();
    }
  } finally {
    if (ownsLock) lock.releaseLock();
  }
}

function listLedgerRows_() {
  ensureLedgerApprovalColumns_();
  return readOperationTableRows_('ledger');
}

function findLedgerRowById_(id) {
  ensureLedgerApprovalColumns_();
  return findOperationTableRowById_('ledger', id);
}

function insertLedgerRow_(row) {
  ensureLedgerApprovalColumns_();
  return appendOperationTableRow_('ledger', row);
}

function updateLedgerRowById_(id, changes) {
  ensureLedgerApprovalColumns_();
  return updateOperationTableRow_('ledger', id, changes);
}

function deleteLedgerRowById_(id) {
  ensureLedgerApprovalColumns_();
  return deleteOperationTableRow_('ledger', id);
}
