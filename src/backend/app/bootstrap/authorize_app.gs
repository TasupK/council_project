// 1. 앱 실행 권한 승인 유도
function authorizeApp() {
  var userSpreadsheet = SpreadsheetApp.openById(DB_CONFIG.userSpreadsheetId);
  var operationSpreadsheet = SpreadsheetApp.openById(DB_CONFIG.operationSpreadsheetId);
  var rootFolder = DriveApp.getFolderById(DB_CONFIG.rootFolderId);
  var email = Session.getActiveUser().getEmail();

  Logger.log(userSpreadsheet.getName());
  Logger.log(operationSpreadsheet.getName());
  Logger.log(rootFolder.getName());
  Logger.log(email);
}
