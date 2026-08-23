// 1. 앱 실행 권한 승인 유도
function authorizeApp() {
  var userSpreadsheet = SpreadsheetApp.openById(DB_CONFIG.userSpreadsheetId);
  var operationSpreadsheet = SpreadsheetApp.openById(DB_CONFIG.operationSpreadsheetId);
  var rootFolder = DriveApp.getFolderById(DB_CONFIG.rootFolderId);
  var email = Session.getActiveUser().getEmail();
  var temporaryDocument = DocumentApp.create('AUTH_CHECK_' + new Date().getTime());
  var temporaryDocumentId = temporaryDocument.getId();

  try {
    temporaryDocument.getBody().setText('학생회 통합 업무관리 OCR 권한 확인');
    temporaryDocument.saveAndClose();
    Logger.log(userSpreadsheet.getName());
    Logger.log(operationSpreadsheet.getName());
    Logger.log(rootFolder.getName());
    Logger.log(email);
  } finally {
    DriveApp.getFileById(temporaryDocumentId).setTrashed(true);
  }
}
