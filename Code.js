/**
 * Code.js
 * 학생회통합업무시스템 - 학생회비관리(FEE) 모듈 진입점
 */

function doGet(e) {
  return HtmlService.createHtmlOutputFromFile('index')
    .setTitle('학생회비관리')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

/**
 * 외부 시스템에서 JSON으로 API를 호출할 때 사용하는 엔드포인트.
 * 요청 형식: POST body(JSON) = { "apiId": "FEE_API_002", "params": { ... } }
 */
function doPost(e) {
  var response;
  try {
    var body = JSON.parse(e.postData.contents || '{}');
    response = callApi_(body.apiId, body.params || {});
  } catch (err) {
    response = fail_(err.message || err);
  }
  return ContentService.createTextOutput(JSON.stringify(response))
    .setMimeType(ContentService.MimeType.JSON);
}

/** 스프레드시트를 열 때 관리자 메뉴 + 초기 시트 세팅 */
function onOpen() {
  ensureAllSheets();
  SpreadsheetApp.getUi()
    .createMenu('학생회비관리')
    .addItem('시트 초기 설정(테이블 생성)', 'ensureAllSheets')
    .addItem('구글폼 트리거 등록', 'installFormTriggers')
    .addSeparator()
    .addItem('웹앱 열기', 'showWebAppUrl_')
    .addToUi();
}

function showWebAppUrl_() {
  var url = ScriptApp.getService().getUrl();
  var ui = SpreadsheetApp.getUi();
  if (url) {
    ui.alert('웹앱 URL', url, ui.ButtonSet.OK);
  } else {
    ui.alert('배포 후(웹 앱으로 배포) 다시 시도해주세요.\n확장 프로그램 > Apps Script > 배포 > 새 배포 > 웹 앱');
  }
}
