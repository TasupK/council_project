/** Accounting 전역에서 공유하는 최소 공통 헬퍼 */

function makeId_(prefix) {
  return prefix + '-' + Utilities.getUuid();
}

function getCurrentUserName_() {
  try {
    return Session.getActiveUser().getEmail() || '운영자';
  } catch (error) {
    console.error('Failed to read accounting user email.', error);
    return '운영자';
  }
}
