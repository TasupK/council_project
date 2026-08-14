/** Apps Script 웹앱 페이지 라우팅 */
function doGet(e) {
  var page = e && e.parameter && e.parameter.page ? String(e.parameter.page) : 'login';
  var routes = {
    login: '200_login/Login',
    main: '250_main/Main',
    accounting: '400_accounting/400_home/Accounting_Home',
    accounting_ledger: '400_accounting/410_ledger/Accounting_Ledger',
    accounting_reconciliation: '400_accounting/420_reconciliation/Accounting_Reconciliation',
    accounting_settlement: '400_accounting/430_settlement/Accounting_Settlement',
    event: '600_event/600_home/Event_Home',
    event_form: '600_event/610_form/Event_Form',
    event_detail: '600_event/620_detail/Event_Detail',
    settings: '300_settings/300_home/Settings_Home',
    settings_users: '300_settings/310_users/Settings_Users',
    settings_roles: '300_settings/320_roles/Settings_Roles',
    settings_permissions: '300_settings/330_permissions/Settings_Permissions'
  };
  var file = routes[page] || routes.login;
  var templateData = {
    loginError: '',
    mainUserName: '',
    mainUserTitle: '',
    isAdmin: false,
    currentPage: page,
    resourceId: e && e.parameter && e.parameter.id ? String(e.parameter.id) : ''
  };

  // 로그인 성공 사용자만 메인, 장부, 행사 및 설정 페이지에 접근
  if (page === 'main' || page.indexOf('accounting') === 0 || page.indexOf('event') === 0 || page.indexOf('settings') === 0) {
    var login = api_checkLogin();
    if (!login.ok) {
      file = routes.login;
      templateData.loginError = login.message || '로그인 정보를 확인할 수 없습니다.';
    } else {
      templateData.mainUserName = login.user && login.user.name ? login.user.name : '운영자';
      templateData.mainUserTitle = login.user && login.user.roles && login.user.roles.length
        ? login.user.roles[0].name
        : '사용자';
      templateData.isAdmin = !!login.isAdmin;
    }
  }

  return renderPage_(file, templateData)
    .setTitle(APP_TITLE)
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

/** HTML 템플릿에 페이지 데이터를 주입하여 반환 */
function renderPage_(filename, data) {
  var template = HtmlService.createTemplateFromFile(filename);
  var values = data || {};
  Object.keys(values).forEach(function (key) {
    template[key] = values[key];
  });
  return template.evaluate();
}

/** HTML 조각 파일 포함 */
function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

/** 현재 웹앱 URL 반환 */
function getWebAppUrl() {
  return ScriptApp.getService().getUrl();
}
