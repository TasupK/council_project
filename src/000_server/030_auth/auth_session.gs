// 1. Apps Script 세션에서 Google 계정 이메일 확인
function readActiveUserEmailFromSession_() {
  try {
    return normalizeEmail_(Session.getActiveUser().getEmail());
  } catch (e) {
    console.error('Failed to read active user email from Apps Script session.', e);
    return '';
  }
}
