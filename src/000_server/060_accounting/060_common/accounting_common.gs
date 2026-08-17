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

function getAccountingActorEmail_(context) {
  return context && context.user && context.user.email ? context.user.email : getCurrentUserName_();
}

function inAccountingDateRange_(value, startDate, endDate) {
  var date = String(formatDateTimeValue_(value) || '').slice(0, 10);
  if (startDate && date < String(startDate)) return false;
  if (endDate && date > String(endDate)) return false;
  return true;
}
