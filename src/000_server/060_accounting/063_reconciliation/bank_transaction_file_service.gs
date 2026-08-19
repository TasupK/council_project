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

function validateBankTransactionExcelFile_(file) {
  if (!file.fileName) throw new Error('파일명이 없습니다.');
  if (!file.contentBase64) throw new Error('파일 내용이 없습니다.');
  var extensionOk = /\.xlsx$/i.test(file.fileName);
  var mimeOk = [
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/octet-stream',
    ''
  ].indexOf(file.mimeType) > -1;
  if (!extensionOk || !mimeOk) throw new Error('토스뱅크 거래내역 .xlsx 파일만 업로드할 수 있습니다.');
}

function readTossBankTransactionRowsFromFile_(file) {
  validateBankTransactionExcelFile_(file);
  var bytes = Utilities.base64Decode(file.contentBase64);
  var blob = Utilities.newBlob(
    bytes,
    file.mimeType || 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    file.fileName
  );
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
    if (convertedId) {
      try { Drive.Files.remove(convertedId); }
      catch (removeError) {
        try { DriveApp.getFileById(convertedId).setTrashed(true); } catch (trashError) {}
      }
    }
  }
}
