/** 거래증빙 Google Drive I/O */

var LEDGER_EVIDENCE_FOLDER_PROPERTY_KEY = 'COUNCIL_LEDGER_EVIDENCE_FOLDER_ID';

function getEvidenceFileContent_(input) {
  var fileId;
  var file;
  var blob;
  input = input || {};
  fileId = input.file_id || '';
  if (!fileId && input.evidence_id) {
    var evidence = listLedgerEvidenceRows_().filter(function (item) {
      return String(item.id) === String(input.evidence_id);
    })[0];
    fileId = evidence ? evidence.driveFileId : '';
  }
  if (!fileId) throw new Error('증빙 파일 ID가 없습니다.');
  file = DriveApp.getFileById(fileId);
  blob = file.getBlob();
  return {
    ok: true,
    file_id: fileId,
    file_name: file.getName(),
    mime_type: blob.getContentType(),
    content_base64: Utilities.base64Encode(blob.getBytes())
  };
}

function sanitizeFileName_(fileName) {
  return String(fileName || 'evidence')
    .replace(/[\\/:*?"<>|]/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 180) || 'evidence';
}

function createEvidenceDriveFile_(transactionId, fileName, mimeType, contentBase64) {
  var folder = getEvidenceFolder_();
  var base64 = String(contentBase64 || '').replace(/^data:[^,]+,/, '');
  var bytes = Utilities.base64Decode(base64);
  var safeName = transactionId + '_' + sanitizeFileName_(fileName);
  var blob = Utilities.newBlob(bytes, mimeType || 'application/octet-stream', safeName);
  return folder.createFile(blob);
}

function getEvidenceFolder_() {
  var props = PropertiesService.getScriptProperties();
  var folderId = props.getProperty(LEDGER_EVIDENCE_FOLDER_PROPERTY_KEY);
  if (folderId) {
    try {
      return DriveApp.getFolderById(folderId);
    } catch (error) {
      props.deleteProperty(LEDGER_EVIDENCE_FOLDER_PROPERTY_KEY);
    }
  }

  if (!DB_CONFIG || !DB_CONFIG.rootFolderId) {
    throw new Error('통합 앱의 Drive 루트 폴더 ID가 설정되지 않았습니다.');
  }
  var rootFolder = DriveApp.getFolderById(DB_CONFIG.rootFolderId);
  var folders = rootFolder.getFoldersByName('학생회 통합 업무관리 증빙자료');
  var folder = folders.hasNext()
    ? folders.next()
    : rootFolder.createFolder('학생회 통합 업무관리 증빙자료');
  props.setProperty(LEDGER_EVIDENCE_FOLDER_PROPERTY_KEY, folder.getId());
  return folder;
}
