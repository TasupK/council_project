/** Accounting에서 사용하는 Event 기준정보 read-only adapter */

function findAllAccountingEventRows_() {
  return readOperationTableRows_('events');
}
