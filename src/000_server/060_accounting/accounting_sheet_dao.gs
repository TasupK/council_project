// 회계 증빙 persistence (Evidence 분리 전 임시 위치)
function findAllLedgerEvidenceRows_() {
  return readOperationTableRows_('evidence');
}

function insertLedgerEvidenceRow_(evidence) {
  return appendOperationTableRow_('evidence', evidence);
}
