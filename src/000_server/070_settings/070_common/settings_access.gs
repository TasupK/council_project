// 1. Settings 인증 사용자 데이터 조회
function requireSettingsAuthData_() {
  return requireAuthenticatedUserData_();
}

function throwSettingsError_(code, message, details) {
  var error = new Error(message || code || 'SETTINGS_ERROR');
  error.code = code || 'SETTINGS_ERROR';
  error.details = details || {};
  throw error;
}

// 2. Settings 조회 접근 확인
function requireSettingsCurrent_() {
  var current = requireSettingsAuthData_();
  if (current.isAdmin || (current.domainAccess && current.domainAccess.settings)) return current;
  throwSettingsError_('FORBIDDEN', '설정 화면에 접근할 권한이 없습니다.');
}

// 기존 내부 서비스 호환용 결과 계약
function getSettingsCurrent_() {
  try {
    return Object.assign({ ok: true }, requireSettingsCurrent_());
  } catch (error) {
    return failResponse_(error.code || 'FORBIDDEN', error.message || '설정 화면에 접근할 권한이 없습니다.', error.details || {});
  }
}

// 3. Settings 관리자 변경 권한 확인
function requireAdminSettingsCurrent_() {
  var current = requireSettingsAuthData_();
  if (current.isAdmin) return current;
  throwSettingsError_('FORBIDDEN', '설정 화면은 시스템 관리자만 이용할 수 있습니다.');
}

function getAdminSettingsCurrent_() {
  try {
    return Object.assign({ ok: true }, requireAdminSettingsCurrent_());
  } catch (error) {
    return failResponse_(error.code || 'FORBIDDEN', error.message || '설정 화면은 시스템 관리자만 이용할 수 있습니다.', error.details || {});
  }
}

// 4. 기존 Settings 내부 서비스 결과를 API Contract v1 데이터/예외로 변환
function unwrapSettingsServiceResult_(result) {
  if (!result || typeof result !== 'object') return result;
  if (result.ok === false) {
    var details = result.details || {};
    throwSettingsError_(result.code || 'SETTINGS_ERROR', result.message || '설정 요청을 처리하지 못했습니다.', details);
  }
  if (result.ok === true) {
    var data = Object.assign({}, result);
    delete data.ok;
    return data;
  }
  return result;
}
