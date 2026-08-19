/** 거래증빙 persistence */

function listLedgerEvidenceRows_() {
  return readOperationTableRows_('evidence');
}

function findLedgerEvidenceRowById_(id) {
  return findOperationTableRowById_('evidence', id);
}

function insertLedgerEvidenceRow_(evidence) {
  return appendOperationTableRow_('evidence', evidence);
}

function updateLedgerEvidenceRowById_(id, changes) {
  return updateOperationTableRow_('evidence', id, changes);
}
