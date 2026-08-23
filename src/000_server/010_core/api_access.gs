// 공통 API access 선언을 도메인 IAM 권한으로 변환해 검증한다.

var API_ACCESS_ACTIONS_ = ['view', 'edit', 'approve', 'export'];

function resolveApiAccess_(context, access) {
  if (!access || typeof access !== 'object') {
    throwApiAccessConfigError_('API access 선언이 필요합니다.');
  }
  var domain = String(access.domain || '').trim();
  var action = String(access.action || '').trim().toLowerCase();
  if (!domain) throwApiAccessConfigError_('API access domain이 필요합니다.');
  if (API_ACCESS_ACTIONS_.indexOf(action) < 0) {
    throwApiAccessConfigError_('지원하지 않는 API 권한 action입니다: ' + action);
  }
  if (typeof access.resolve !== 'function') {
    throwApiAccessConfigError_('API access resolver가 필요합니다: ' + domain + '/' + action);
  }
  // 관리자는 개별 권한 카탈로그가 아직 구성되지 않은 도메인도 관리할 수 있어야 한다.
  if (context && context.isAdmin) return true;

  var resolved = access.resolve(access);
  if (!resolved || !resolved.screenId) {
    throwApiAccessConfigError_('API access screenId를 확인할 수 없습니다: ' + domain + '/' + action);
  }
  requirePermission_(context, resolved);
  return true;
}

function throwApiAccessConfigError_(message) {
  var error = new Error(message || 'API 권한 설정이 올바르지 않습니다.');
  error.code = 'ACCESS_CONFIG_ERROR';
  throw error;
}
