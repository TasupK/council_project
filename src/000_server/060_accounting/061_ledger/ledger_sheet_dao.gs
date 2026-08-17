/** 수입지출원장 Sheet DAO */

function findAllLedgerRows_() {
  return readOperationTableRows_('ledger');
}

function findLedgerRowById_(id) {
  return findOperationTableRowById_('ledger', id);
}

function insertLedgerRow_(row) {
  return appendOperationTableRow_('ledger', row);
}

function updateLedgerRowById_(id, changes) {
  return updateOperationTableRow_('ledger', id, changes);
}
