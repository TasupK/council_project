/** 거래증빙 persistence */

function findAllLedgerEvidenceRows_() {
  return readOperationTableRows_('evidence');
}

function insertLedgerEvidenceRow_(evidence) {
  return appendOperationTableRow_('evidence', evidence);
}
