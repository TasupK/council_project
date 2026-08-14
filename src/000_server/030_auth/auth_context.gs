/** 모든 보호 API에서 사용하는 로그인 컨텍스트 검증 */

function requireLoginContext_() {
  var context = getSessionUserContext_();
  if (context && context.ok) return context;

  var code = context && context.code ? context.code : 'NO_SESSION';
  var message = context && context.message ? context.message : '로그인이 필요합니다.';
  console.error('Login context validation failed.', { code: code });

  var error = new Error(message);
  error.code = code;
  throw error;
}
