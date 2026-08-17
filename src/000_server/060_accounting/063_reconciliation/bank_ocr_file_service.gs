/** 계좌 파일 OCR Drive service */

function normalizeBankUploadFile_(file) {
  file = file || {};
  return {
    file_name: String(file.file_name || file.name || '').trim(),
    file_type: String(file.file_type || file.mime_type || '').trim().toLowerCase(),
    file_size: Number(file.file_size || 0),
    content_base64: String(file.content_base64 || file.data || '').replace(/^data:[^,]+,/, '')
  };
}

function validateBankOcrFile_(file) {
  if (!file.file_name) throw new Error('파일명이 없습니다.');
  if (!file.content_base64) throw new Error('파일 내용이 없습니다.');
  var allowed = ['image/png', 'image/jpeg', 'image/jpg', 'image/gif', 'image/bmp', 'image/webp', 'application/pdf'];
  if (allowed.indexOf(file.file_type) < 0) throw new Error('OCR은 이미지 또는 PDF 파일만 지원합니다.');
}

function extractBankOcrText_(file) {
  var bytes = Utilities.base64Decode(file.content_base64);
  var blob = Utilities.newBlob(bytes, file.file_type, file.file_name);
  var documentId = '';
  try {
    var created = Drive.Files.create({ name: 'OCR_' + file.file_name, mimeType: 'application/vnd.google-apps.document' }, blob, { ocrLanguage: 'ko', fields: 'id' });
    documentId = created.id;
    return DocumentApp.openById(documentId).getBody().getText() || '';
  } finally {
    if (documentId) {
      try { Drive.Files.remove(documentId); }
      catch (removeError) {
        try { DriveApp.getFileById(documentId).setTrashed(true); } catch (trashError) {}
      }
    }
  }
}
