/** 수입지출원장 persistence */

function findAllLedgerRows_() {
  return readOperationTableRows_('ledger');
}

function insertLedgerRow_(ledger) {
  return appendOperationTableRow_('ledger', ledger);
}

function updateLedgerRowById_(transactionId, changes) {
  return updateOperationTableRow_('ledger', transactionId, changes);
}
