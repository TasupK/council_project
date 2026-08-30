// 1. 현재 유효 권한을 앱 업무 도메인 접근 맵으로 변환
function buildDomainAccess_(permissions, isAdmin) {
  var result = { main: false, accounting: false, student_fee: false, event: false, settings: false };
  if (isAdmin) {
    Object.keys(result).forEach(function (key) { result[key] = true; });
    return result;
  }

  var aliases = {
    main: ['main', '메인'],
    accounting: ['accounting', '회계', '장부'],
    student_fee: ['studentfee', '학생회비', '회비'],
    event: ['event', '행사', '복지'],
    settings: ['settings', '설정']
  };
  var menuTokens = (permissions && permissions.menus ? permissions.menus : []).map(function (menu) {
    return normalizeDomainAccessToken_([menu.id, menu.name, menu.group].join(' '));
  });

  Object.keys(result).forEach(function (domain) {
    result[domain] = menuTokens.some(function (token) {
      return aliases[domain].some(function (alias) {
        return token.indexOf(normalizeDomainAccessToken_(alias)) !== -1;
      });
    });
  });
  return result;
}

function normalizeDomainAccessToken_(value) {
  return String(value || '').toLowerCase().replace(/[\s_-]+/g, '');
}
