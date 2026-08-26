// 1. 페이지를 업무 도메인으로 변환
function resolvePageDomain_(page) {
  var value = String(page || '');
  if (value === 'login') return 'public';
  if (value === 'mypage') return 'mypage';
  if (value === 'main') return 'main';
  if (value.indexOf('accounting') === 0) return 'accounting';
  if (value.indexOf('student_fee') === 0) return 'student_fee';
  if (value.indexOf('event') === 0) return 'event';
  if (value.indexOf('settings') === 0) return 'settings';
  return '';
}

// 2. 현재 유효 권한을 앱 업무 도메인 접근 맵으로 변환
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
    return normalizeAccessToken_([menu.id, menu.name, menu.group].join(' '));
  });

  Object.keys(result).forEach(function (domain) {
    result[domain] = menuTokens.some(function (token) {
      return aliases[domain].some(function (alias) {
        return token.indexOf(normalizeAccessToken_(alias)) !== -1;
      });
    });
  });
  return result;
}

function normalizeAccessToken_(value) {
  return String(value || '').toLowerCase().replace(/[\s_-]+/g, '');
}

// 3. 인증 결과 기준 페이지 접근 허용 여부
function canAccessPage_(page, login) {
  var domain = resolvePageDomain_(page);
  if (domain === 'public') return true;
  if (!login || !login.ok) return false;
  if (domain === 'mypage') return true;
  if (!domain) return false;
  if (login.isAdmin) return true;
  return !!(login.domainAccess && login.domainAccess[domain]);
}
