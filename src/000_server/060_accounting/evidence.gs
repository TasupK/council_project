/** 장부 증빙자료 Google Drive 처리 */

// 1. 증빙 파일 조회
function api_getEvidenceFileContent(request) {
  return apiHandler_({
    operation: 'getEvidenceFileContent',
    input: request,
    requireLogin: true,
    service: function (input) {
      var fileId;
      var file;
      var blob;
      input = input || {};
      fileId = input.file_id || '';
      if (!fileId && input.evidence_id) {
        var evidence = findAllLedgerEvidenceRows_().filter(function (item) {
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
  });
}

// 2. 증빙 파일과 메타데이터 저장
function saveEvidenceFiles_(transactionId, files, timestamp) {
  files = files || [];
  if (!files.length) return { savedCount: 0, errors: [] };

  var result = { savedCount: 0, errors: [] };
  files.forEach(function (file, index) {
    file = file || {};
    var fileName = file.file_name || file.name || ('evidence_' + (index + 1));
    var storedFile = null;

    if (file.content_base64) {
      try {
        storedFile = createEvidenceDriveFile_(transactionId, fileName, file.file_type || file.mime_type, file.content_base64);
      } catch (error) {
        result.errors.push({ file_name: fileName, message: error.message || String(error) });
      }
    }

    var evidence = {
      id: makeId_('EVD'),
      transactionId: transactionId,
      category: file.evidence_category || '추가증빙',
      type: file.evidence_type || '기타',
      evidenceDate: file.evidence_date || '',
      amount: file.evidence_amount || '',
      driveFileId: storedFile ? storedFile.getId() : (file.file_id || ''),
      fileName: fileName,
      managerId: getCurrentUserName_(),
      createdAt: timestamp || getCurrentIsoDateTime_(),
      note: file.note || ''
    };

    insertLedgerEvidenceRow_(evidence);
    result.savedCount += 1;
  });
  return result;
}

// 3. Drive 저장용 파일명 정리
function sanitizeFileName_(fileName) {
  return String(fileName || 'evidence')
    .replace(/[\\/:*?"<>|]/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 180) || 'evidence';
}

// 4. Base64 파일을 Drive 파일로 생성
function createEvidenceDriveFile_(transactionId, fileName, mimeType, contentBase64) {
  var folder = getEvidenceFolder_();
  var base64 = String(contentBase64 || '').replace(/^data:[^,]+,/, '');
  var bytes = Utilities.base64Decode(base64);
  var safeName = transactionId + '_' + sanitizeFileName_(fileName);
  var blob = Utilities.newBlob(bytes, mimeType || 'application/octet-stream', safeName);
  return folder.createFile(blob);
}

// 5. 증빙 저장 폴더 조회 또는 생성
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
