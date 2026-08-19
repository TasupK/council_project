/** Accounting에서 사용하는 Event 기준정보 read-only adapter */

function listAccountingEventRows_() {
  return readOperationTableRows_('events');
}
