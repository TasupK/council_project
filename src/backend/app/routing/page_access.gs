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

// 2. 인증 결과 기준 페이지 접근 허용 여부
function canAccessPage_(page, login) {
  var domain = resolvePageDomain_(page);
  if (domain === 'public') return true;
  if (!login || !login.ok) return false;
  if (domain === 'mypage') return true;
  if (!domain) return false;
  if (login.isAdmin) return true;
  return !!(login.domainAccess && login.domainAccess[domain]);
}
