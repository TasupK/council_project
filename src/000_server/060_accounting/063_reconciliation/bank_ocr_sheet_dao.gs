/** 계좌 OCR 로그 Sheet DAO */
function findAllBankOcrLogRows_() { return readOperationTableRows_('bankOcrLogs'); }
function insertBankOcrLogRow_(row) { return appendOperationTableRow_('bankOcrLogs', row); }
