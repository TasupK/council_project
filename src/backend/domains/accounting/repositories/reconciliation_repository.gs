/** 감사대사 헤더/상세 Sheet DAO */
function listReconciliationRows_() { return readOperationTableRows_('reconciliation'); }
function findReconciliationRowById_(id) { return findOperationTableRowById_('reconciliation', id); }
function insertReconciliationRow_(row) { return appendOperationTableRow_('reconciliation', row); }
function updateReconciliationRowById_(id, changes) { return updateOperationTableRow_('reconciliation', id, changes); }
function listReconciliationItemRows_() { return readOperationTableRows_('reconciliationItems'); }
function findReconciliationItemRowById_(id) { return findOperationTableRowById_('reconciliationItems', id); }
function insertReconciliationItemRow_(row) { return appendOperationTableRow_('reconciliationItems', row); }
function updateReconciliationItemRowById_(id, changes) { return updateOperationTableRow_('reconciliationItems', id, changes); }
