/** Toss Bank Excel 업로드 파일 I/O */

function normalizeBankTransactionUploadFile_(file) {
  file = file || {};
  return {
    fileName: String(file.file_name || file.name || '').trim(),
    mimeType: String(file.file_type || file.mime_type || '').trim().toLowerCase(),
    fileSize: Number(file.file_size || 0),
    contentBase64: String(file.content_base64 || file.data || '').replace(/^data:[^,]+,/, '')
  };
}

function getBankTransactionUploadFileKind_(file) {
  var name = String(file.fileName || '').toLowerCase();
  var mime = String(file.mimeType || '').toLowerCase();
  if (/\.(xlsx|xls)$/.test(name) || /spreadsheetml|ms-excel/.test(mime)) return 'spreadsheet';
  if (/\.csv$/.test(name) || mime === 'text/csv') return 'csv';
  if (/\.pdf$/.test(name) || mime === 'application/pdf') return 'ocr';
  if (/\.(png|jpe?g|webp|gif|bmp)$/.test(name) || /^image\//.test(mime)) return 'ocr';
  return '';
}

function validateBankTransactionUploadFile_(file) {
  if (!file.fileName) throw new Error('파일명이 없습니다.');
  if (!file.contentBase64) throw new Error('파일 내용이 없습니다.');
  var kind = getBankTransactionUploadFileKind_(file);
  if (!kind) throw new Error('Excel, CSV, PDF 또는 이미지 파일만 업로드할 수 있습니다.');
  return kind;
}

function createBankTransactionUploadBlob_(file) {
  return Utilities.newBlob(
    Utilities.base64Decode(file.contentBase64),
    file.mimeType || 'application/octet-stream',
    file.fileName
  );
}

function readTossBankTransactionRowsFromFile_(file) {
  var kind = validateBankTransactionUploadFile_(file);
  if (kind === 'csv') return readTossBankCsvRows_(file);
  if (kind === 'ocr') return readTossBankOcrRows_(file);
  return readTossBankSpreadsheetRows_(file);
}

function readTossBankSpreadsheetRows_(file) {
  var blob = createBankTransactionUploadBlob_(file);
  var convertedId = '';
  try {
    var converted = Drive.Files.create({
      name: 'IMPORT_' + file.fileName,
      mimeType: 'application/vnd.google-apps.spreadsheet'
    }, blob, { fields: 'id' });
    convertedId = converted.id;
    var spreadsheet = SpreadsheetApp.openById(convertedId);
    var sheets = spreadsheet.getSheets();
    if (!sheets.length) throw new Error('거래내역 시트를 찾을 수 없습니다.');

    var selectedValues = null;
    for (var i = 0; i < sheets.length; i += 1) {
      var values = sheets[i].getDataRange().getValues();
      if (findTossBankHeaderRowIndex_(values) > -1) {
        selectedValues = values;
        break;
      }
    }
    if (!selectedValues) throw new Error('토스뱅크 거래내역 헤더를 찾을 수 없습니다.');
    return mapTossBankSheetValuesToRows_(selectedValues);
  } finally {
    removeTemporaryBankImportFile_(convertedId);
  }
}

function readTossBankCsvRows_(file) {
  var blob = createBankTransactionUploadBlob_(file);
  var charsets = ['UTF-8', 'EUC-KR'];
  for (var i = 0; i < charsets.length; i += 1) {
    try {
      var text = blob.getDataAsString(charsets[i]).replace(/^\uFEFF/, '');
      var values = Utilities.parseCsv(text);
      if (findTossBankHeaderRowIndex_(values) > -1) return mapTossBankSheetValuesToRows_(values);
    } catch (error) {}
  }
  throw new Error('CSV에서 토스뱅크 거래내역 헤더를 찾을 수 없습니다.');
}

function readTossBankOcrRows_(file) {
  var blob = createBankTransactionUploadBlob_(file);
  var documentId = '';
  try {
    var created = Drive.Files.create({
      name: 'OCR_IMPORT_' + file.fileName,
      mimeType: 'application/vnd.google-apps.document'
    }, blob, { ocrLanguage: 'ko', fields: 'id' });
    documentId = created.id;
    var text = DocumentApp.openById(documentId).getBody().getText() || '';
    return parseTossBankOcrTextToRows_(text);
  } finally {
    removeTemporaryBankImportFile_(documentId);
  }
}

function removeTemporaryBankImportFile_(fileId) {
  if (!fileId) return;
  try { Drive.Files.remove(fileId); }
  catch (removeError) {
    try { DriveApp.getFileById(fileId).setTrashed(true); } catch (trashError) {}
  }
}
