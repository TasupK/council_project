const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const sidebar = fs.readFileSync(path.join(ROOT, 'src/frontend/widgets/app_sidebar/App_Sidebar.html'), 'utf8');
const shell = fs.readFileSync(path.join(ROOT, 'src/frontend/app/shell/app_shell_js.html'), 'utf8');

function tagById(source, id) {
  const match = source.match(new RegExp(`<[^>]+id=["']${id}["'][^>]*>`));
  return match ? match[0] : '';
}

function divBlockById(source, id) {
  const idIndex = source.indexOf(`id="${id}"`);
  if (idIndex < 0) return '';
  const start = source.lastIndexOf('<div', idIndex);
  const end = source.indexOf('</div>', idIndex);
  return start >= 0 && end >= 0 ? source.slice(start, end + 6) : '';
}

const accountingGroupTag = tagById(sidebar, 'appNavAccountingGroup');
assert.ok(accountingGroupTag && /class=["'][^"']*nav-group/.test(accountingGroupTag),
  '장부관리는 nav-group 컨테이너여야 합니다.');

const accountingToggleTag = tagById(sidebar, 'appNavAccounting');
assert.ok(/^<button/.test(accountingToggleTag) && /aria-controls=["']appAccountingSubmenu["']/.test(accountingToggleTag),
  '장부관리 상위 메뉴는 이동 링크가 아니라 submenu toggle 버튼이어야 합니다.');

const accountingSubmenuTag = tagById(sidebar, 'appAccountingSubmenu');
assert.ok(accountingSubmenuTag && /class=["'][^"']*nav-submenu/.test(accountingSubmenuTag),
  '장부관리 submenu가 필요합니다.');

[
  ['appNavAccountingLedger', '원장 관리'],
  ['appNavAccountingReconciliation', '대사 관리'],
  ['appNavAccountingSettlement', '결산 관리']
].forEach(function (item) {
  const pattern = new RegExp(`id=["']${item[0]}["'][^>]*>\\s*${item[1]}\\s*</a>`);
  assert.match(sidebar, pattern, item[1] + ' 하위 메뉴가 필요합니다.');
});
const accountingSubmenu = divBlockById(sidebar, 'appAccountingSubmenu');
assert.doesNotMatch(accountingSubmenu, /appNavAccountingHome|>\s*전체 현황\s*<\/a>/,
  '장부관리 submenu에는 전체 현황을 노출하지 않습니다.');

assert.match(shell, /appNavAccountingLedger['"]\)\.href\s*=\s*buildAppPageUrl\(['"]accounting_ledger['"]\)/,
  '원장 관리 링크가 accounting_ledger에 연결되어야 합니다.');
assert.match(shell, /appNavAccountingReconciliation['"]\)\.href\s*=\s*buildAppPageUrl\(['"]accounting_reconciliation['"]\)/,
  '대사 관리 링크가 accounting_reconciliation에 연결되어야 합니다.');
assert.match(shell, /appNavAccountingSettlement['"]\)\.href\s*=\s*buildAppPageUrl\(['"]accounting_settlement['"]\)/,
  '결산 관리 링크가 accounting_settlement에 연결되어야 합니다.');
assert.match(shell, /function\s+setAccountingSubmenuExpanded_\s*\(/,
  '장부관리 submenu 펼침 함수가 필요합니다.');
assert.match(shell, /appNavAccounting['"]\)\.addEventListener\(['"]click['"]/,
  '장부관리 상위 메뉴 클릭 시 토글 동작이 필요합니다.');
assert.match(shell, /setAccountingSubmenuExpanded_\(isAccountingPage_\(current\)\)/,
  'accounting 하위 페이지에서는 submenu가 자동으로 펼쳐져야 합니다.');
assert.match(shell, /accountingLedger\.classList\.toggle\(['"]active['"],\s*current\s*===\s*['"]accounting_ledger['"]\)/,
  '원장 관리 active 상태가 필요합니다.');
assert.match(shell, /accountingReconciliation\.classList\.toggle\(['"]active['"],\s*current\s*===\s*['"]accounting_reconciliation['"]\)/,
  '대사 관리 active 상태가 필요합니다.');
assert.match(shell, /accountingSettlement\.classList\.toggle\(['"]active['"],\s*current\s*===\s*['"]accounting_settlement['"]\)/,
  '결산 관리 active 상태가 필요합니다.');

console.log('Accounting sidebar group contract: PASS');
