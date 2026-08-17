/** 결산보고서 Sheet DAO */
function findAllSettlementReportRows_() { return readOperationTableRows_('settlementReports'); }
function findSettlementReportRowById_(id) { return findOperationTableRowById_('settlementReports', id); }
function insertSettlementReportRow_(row) { return appendOperationTableRow_('settlementReports', row); }
