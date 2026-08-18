/** 거래증빙 persistence */

function listLedgerEvidenceRows_() {
  return readOperationTableRows_('evidence');
}

function insertLedgerEvidenceRow_(evidence) {
  return appendOperationTableRow_('evidence', evidence);
}
