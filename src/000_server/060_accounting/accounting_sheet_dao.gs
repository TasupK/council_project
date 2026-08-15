// 1. 회계 장부 행 조회
function findAllLedgerRows_() {
  return readOperationTableRows_('ledger');
}

function findAllLedgerEvidenceRows_() {
  return readOperationTableRows_('evidence');
}

function findAllAccountingEventRows_() {
  return readOperationTableRows_('events');
}

// 2. 회계 장부 행 저장
function insertLedgerRow_(ledger) {
  return appendOperationTableRow_('ledger', ledger);
}

function updateLedgerRowById_(transactionId, changes) {
  return updateOperationTableRow_('ledger', transactionId, changes);
}

// 3. 회계 증빙 행 저장
function insertLedgerEvidenceRow_(evidence) {
  return appendOperationTableRow_('evidence', evidence);
}
