from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

def write(rel, content):
    p = ROOT / rel
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(content, encoding='utf-8')

def read(rel):
    return (ROOT / rel).read_text(encoding='utf-8')

# Ledger view: keep current layout, align statuses and add edit/delete controls.
ledger_view = read('src/400_accounting/410_ledger/Accounting_Ledger_View.html')
ledger_view = ledger_view.replace('<option>대기</option><option>승인</option><option>확인요청</option>', '<option>미확인</option><option>정상</option><option>확인필요</option><option>임시저장</option>')
ledger_view = ledger_view.replace('<label>부서명 *</label><select id="formDepartment" name="department_name" required></select>', '<label>부서명</label><select id="formDepartment" name="department_name" disabled><option value="">미사용</option></select>')
ledger_view = ledger_view.replace('<button class="approve ui-btn success" id="approve" type="button">승인</button>', '<button class="secondary ui-btn outline" id="editLedger" type="button">수정</button><button class="secondary ui-btn danger" id="deleteLedger" type="button">삭제</button><button class="approve ui-btn success" id="approve" type="button">정상 처리</button>')
write('src/400_accounting/410_ledger/Accounting_Ledger_View.html', ledger_view)

write('src/400_accounting/410_ledger/accounting_ledger_js.html', r'''<script>
function optionHtml(values) {
  return values.map(function (item) {
    if (typeof item === 'string') return '<option value="' + escapeHtml(item) + '">' + escapeHtml(item) + '</option>';
    return '<option value="' + escapeHtml(item.value) + '">' + escapeHtml(item.label) + '</option>';
  }).join('');
}

function ledgerFilter() {
  return {
    keyword: document.getElementById('keyword').value.trim(),
    transaction_type: document.getElementById('type').value,
    event_name: document.getElementById('event').value,
    status: document.getElementById('status').value
  };
}

function filteredItems() {
  const f = ledgerFilter();
  const keyword = f.keyword.toLowerCase();
  return state.items.filter(function (item) {
    const haystack = [item.counterparty, item.description, item.event_name, item.manager].join(' ').toLowerCase();
    return (!keyword || haystack.includes(keyword)) &&
      (f.transaction_type === '전체' || item.transaction_type === f.transaction_type) &&
      (f.event_name === '전체' || item.event_name === f.event_name) &&
      (f.status === '전체' || item.status === f.status);
  });
}

function badgeClass(status) {
  if (status === '정상') return 'approved';
  if (status === '확인필요') return 'review';
  return 'pending';
}

function renderLedgerSummary(summary) {
  summary = summary || {};
  document.getElementById('sumIncome').textContent = currency(summary.totalIncome || 0);
  document.getElementById('sumExpense').textContent = currency(summary.totalExpense || 0);
  document.getElementById('sumPending').textContent = (summary.pendingCount || 0) + '건';
  document.getElementById('sumReview').textContent = (summary.reviewCount || 0) + '건';
}

function renderPagination(totalItems, totalPages) {
  document.getElementById('ledgerPageInfo').textContent = state.ledgerPage + ' / ' + totalPages;
  document.getElementById('prevLedgerPage').disabled = state.ledgerPage <= 1;
  document.getElementById('nextLedgerPage').disabled = state.ledgerPage >= totalPages;
}

function render() {
  const items = filteredItems();
  const totalPages = Math.max(1, Math.ceil(items.length / state.ledgerPageSize));
  state.ledgerPage = Math.min(Math.max(1, state.ledgerPage), totalPages);
  const start = (state.ledgerPage - 1) * state.ledgerPageSize;
  const pageItems = items.slice(start, start + state.ledgerPageSize);
  document.getElementById('rows').innerHTML = pageItems.length ? pageItems.map(function (item) {
    const income = item.transaction_type === '수입';
    return '<tr><td>' + escapeHtml(String(item.transaction_date || '').slice(0, 10)) + '</td>' +
      '<td class="' + (income ? 'income' : 'expense') + '">' + escapeHtml(item.transaction_type) + '</td>' +
      '<td>-</td><td>' + escapeHtml(item.counterparty || '') + '</td>' +
      '<td class="' + (income ? 'income' : 'muted') + '">' + (income ? won.format(item.amount || 0) : '-') + '</td>' +
      '<td class="' + (income ? 'muted' : 'expense') + '">' + (income ? '-' : won.format(item.amount || 0)) + '</td>' +
      '<td>' + escapeHtml(item.event_name || '해당없음') + '</td><td><strong>' + (item.has_evidence ? 'O' : 'X') + '</strong></td>' +
      '<td><span class="badge ' + badgeClass(item.status) + '">' + escapeHtml(item.status || '') + '</span></td>' +
      '<td>' + escapeHtml(item.manager || '') + '</td><td><button class="small" type="button" data-id="' + escapeHtml(item.transaction_id) + '">상세보기</button></td></tr>';
  }).join('') : '<tr><td colspan="11" class="muted">표시할 수입·지출 내역이 없습니다.</td></tr>';
  renderPagination(items.length, totalPages);
}

function goLedgerPage(page) { state.ledgerPage = page; render(); }
function openModal(id) { document.getElementById(id).classList.add('open'); }
function closeModal(id) { document.getElementById(id).classList.remove('open'); }
function setType(type) {
  state.selectedType = type;
  document.getElementById('expenseBtn').className = type === '지출' ? 'segment expense-on' : 'segment';
  document.getElementById('incomeBtn').className = type === '수입' ? 'segment income-on' : 'segment';
}

function fillControls() {
  const eventOptions = [{ value: '', label: '해당없음' }].concat(state.events.map(function (e) { return { value: e.event_id, label: e.event_name }; }));
  document.getElementById('event').innerHTML = optionHtml(['전체'].concat(state.events.map(function (e) { return e.event_name; })));
  document.getElementById('formEvent').innerHTML = optionHtml(eventOptions);
  document.getElementById('department').innerHTML = '<option value="전체">부서 미사용</option>';
  document.getElementById('formDepartment').innerHTML = '<option value="">미사용</option>';
  updateBalance();
}

function updateBalance() {
  const eventId = document.getElementById('formEvent').value;
  const found = state.events.find(function (e) { return String(e.event_id) === String(eventId); });
  document.getElementById('eventBalance').textContent = '선택한 행사 잔액: ' + currency(found ? found.balance : 0);
}

function readForm() {
  const data = new FormData(document.getElementById('entryForm'));
  return {
    transaction_id: state.editingLedgerId || '',
    transaction_type: state.selectedType,
    transaction_date: data.get('transaction_date'),
    amount: Number(data.get('amount') || 0),
    counterparty: data.get('counterparty'),
    event_id: data.get('event_name') || '',
    description: data.get('description') || ''
  };
}

function readFilePayloads(files) {
  return Promise.all((files || []).map(function (file) {
    return new Promise(function (resolve, reject) {
      const reader = new FileReader();
      reader.onload = function () {
        const result = String(reader.result || '');
        resolve({ file_name: file.name, file_type: file.type || 'application/octet-stream', file_size: file.size, content_base64: result.includes(',') ? result.split(',')[1] : result });
      };
      reader.onerror = function () { reject(new Error(file.name + ' 파일을 읽을 수 없습니다.')); };
      reader.readAsDataURL(file);
    });
  }));
}

async function refreshLedger() {
  const results = await Promise.all([
    callServer('api_getLedgerList', {}, { items: state.items }),
    callServer('api_getLedgerSummary', {}, {}),
    callServer('api_getLedgerEventOptions', {}, state.events)
  ]);
  state.items = (results[0] && results[0].items) || [];
  state.events = results[2] || [];
  fillControls();
  renderLedgerSummary(results[1] || {});
  render();
}

async function saveEntry(draft) {
  const item = readForm();
  if (!draft && (!item.transaction_date || !item.amount || !item.counterparty)) return toast('필수 항목을 입력해 주세요.');
  try {
    if (!state.editingLedgerId) item.evidence_files = await readFilePayloads(state.uploadFiles.ledgerEntry);
    const api = state.editingLedgerId ? 'api_updateLedgerEntry' : (draft ? 'api_saveLedgerDraft' : 'api_createLedgerEntry');
    const result = await callServer(api, item, null, { strict: true });
    if (!result || !result.ok) throw new Error('저장 결과가 올바르지 않습니다.');
    state.editingLedgerId = null;
    document.getElementById('create').textContent = '등록하기';
    document.getElementById('entryForm').reset();
    state.uploadFiles.ledgerEntry = [];
    closeModal('registerModal');
    await refreshLedger();
    toast(draft ? '임시저장되었습니다.' : '저장되었습니다.');
  } catch (error) { toast(error && error.message ? error.message : '저장 중 오류가 발생했습니다.'); }
}

function openDetail(id) {
  const item = state.items.find(function (entry) { return String(entry.transaction_id) === String(id); });
  if (!item) return;
  state.selectedId = item.transaction_id;
  document.getElementById('detailTitle').textContent = item.transaction_type + ' 상세';
  document.getElementById('detailStatus').className = 'badge ' + badgeClass(item.status);
  document.getElementById('detailStatus').textContent = item.status;
  document.getElementById('detailAlert').style.display = 'none';
  document.getElementById('detailRows').innerHTML = [
    ['거래일자', String(item.transaction_date || '').slice(0, 10)], ['금액', currency(item.amount)], ['거래처/입금자명', item.counterparty || '-'],
    ['행사 연결', item.event_name || '해당없음'], ['적요', item.description || '-'], ['담당자', item.manager || '-']
  ].map(function (row) { return '<div class="detail-row"><span class="detail-label">' + escapeHtml(row[0]) + '</span><span class="detail-value">' + escapeHtml(row[1]) + '</span></div>'; }).join('');
  renderDetailEvidence(item);
  openModal('detailModal');
}

function renderDetailEvidence(item) {
  const files = item.evidence || [];
  document.getElementById('detailEvidenceList').innerHTML = files.length ? files.map(function (file) {
    return '<div class="evidence-file"><span class="evidence-name">' + escapeHtml(file.file_name || '증빙자료') + '</span>' +
      (file.file_id ? '<button class="small" type="button" data-evidence-id="' + escapeHtml(file.evidence_id || '') + '" data-file-id="' + escapeHtml(file.file_id) + '">파일 열기</button>' : '') + '</div>';
  }).join('') : '<div class="evidence-empty">첨부된 증빙자료가 없습니다.</div>';
}

async function approve() {
  if (!state.selectedId) return;
  await callServer('api_processLedgerEntry', { transaction_id: state.selectedId, action: 'approve' }, null, { strict: true });
  closeModal('detailModal');
  await refreshLedger();
  toast('정상 처리되었습니다.');
}

function editSelectedLedger() {
  const item = state.items.find(function (entry) { return String(entry.transaction_id) === String(state.selectedId); });
  if (!item) return;
  state.editingLedgerId = item.transaction_id;
  setType(item.transaction_type);
  const form = document.getElementById('entryForm');
  form.elements.transaction_date.value = String(item.transaction_date || '').slice(0, 10);
  form.elements.amount.value = item.amount || 0;
  form.elements.counterparty.value = item.counterparty || '';
  form.elements.event_name.value = item.event_id || '';
  form.elements.description.value = item.description || '';
  document.getElementById('create').textContent = '수정 저장';
  closeModal('detailModal'); openModal('registerModal');
}

async function deleteSelectedLedger() {
  if (!state.selectedId || !window.confirm('이 거래를 삭제 상태로 변경할까요?')) return;
  await callServer('api_deleteLedgerEntry', { transaction_id: state.selectedId }, null, { strict: true });
  closeModal('detailModal'); await refreshLedger(); toast('삭제 처리되었습니다.');
}

async function updateDatabaseLink() {
  const info = await callServer('api_getLedgerDatabaseInfo', {}, null);
  const link = document.getElementById('ledgerDbLink');
  if (!info || !info.spreadsheetUrl) { link.removeAttribute('href'); link.textContent = 'DB 시트 확인 불가'; return; }
  link.href = info.spreadsheetUrl; link.textContent = 'DB 시트 확인 (' + info.transactionRowCount + '건)';
}

setupAccountingPageLinks();
setupFileUpload({ key: 'ledgerEntry', zoneId: 'entryEvidenceDropzone', inputId: 'entryEvidenceFile', nameId: 'entryEvidenceFileName', multiple: true });
document.getElementById('openRegister').addEventListener('click', function () { state.editingLedgerId = null; document.getElementById('create').textContent = '등록하기'; setType('지출'); openModal('registerModal'); });
document.getElementById('expenseBtn').addEventListener('click', function () { setType('지출'); });
document.getElementById('incomeBtn').addEventListener('click', function () { setType('수입'); });
document.getElementById('formEvent').addEventListener('change', updateBalance);
document.getElementById('draft').addEventListener('click', function () { saveEntry(true); });
document.getElementById('create').addEventListener('click', function () { saveEntry(false); });
document.getElementById('approve').addEventListener('click', approve);
document.getElementById('editLedger').addEventListener('click', editSelectedLedger);
document.getElementById('deleteLedger').addEventListener('click', deleteSelectedLedger);
document.querySelectorAll('[data-close]').forEach(function (button) { button.addEventListener('click', function () { closeModal(button.dataset.close); }); });
document.querySelectorAll('.filters input, .filters select').forEach(function (element) { element.addEventListener('input', function () { state.ledgerPage = 1; render(); }); });
document.getElementById('prevLedgerPage').addEventListener('click', function () { goLedgerPage(state.ledgerPage - 1); });
document.getElementById('nextLedgerPage').addEventListener('click', function () { goLedgerPage(state.ledgerPage + 1); });
document.getElementById('rows').addEventListener('click', function (event) { const button = event.target.closest('[data-id]'); if (button) openDetail(button.dataset.id); });

async function initializeLedgerPage() { await refreshLedger(); await updateDatabaseLink(); }
initializeLedgerPage();
</script>
''')

# Reconciliation view + JS
write('src/400_accounting/420_reconciliation/Accounting_Reconciliation_View.html', r'''<div class="accounting-page">
  <section class="page-head ui-page-head"><div><p class="breadcrumb">장부관리 / 계좌·장부 대조</p><h1>계좌내역 대조</h1><p class="desc">계좌 파일을 먼저 분석한 뒤 선택 기간의 공식 감사대사를 실행합니다.</p></div></section>
  <nav class="accounting-tabs ui-tabs" aria-label="회계관리 화면"><a class="ui-tab" data-accounting-page="accounting_ledger">수입·지출 관리</a><a class="active ui-tab" data-accounting-page="accounting_reconciliation">계좌·장부 대조</a><a class="ui-tab" data-accounting-page="accounting_settlement">결산 보고서</a></nav>
  <div class="workspace"><section class="feature-view" id="reconciliationView">
    <article class="reconcile-upload-panel ui-card"><div class="reconcile-upload-copy"><strong>은행 거래내역 OCR 분석</strong><p>이미지/PDF에서 수입·지출 거래를 추출해 계좌거래 원본을 저장합니다. 이 단계에서는 공식 대사 이력이 생성되지 않습니다.</p></div><div class="reconcile-upload-row"><label class="reconcile-dropzone" id="reconciliationDropzone" for="reconciliationFile"><input id="reconciliationFile" type="file" accept=".pdf,.png,.jpg,.jpeg,.webp" multiple><span class="upload-icon">⇧</span><span class="upload-main">이미지 또는 PDF 선택</span><span class="file-name" id="reconciliationFileName">선택된 파일 없음</span></label><button class="secondary ui-btn outline" id="uploadBankTransactions" type="button">파일 분석</button></div><div class="upload-note" id="ocrResultSummary">분석 전</div></article>
    <section class="reconcile-filterbar ui-toolbar"><label class="filter-chip date-range ui-field"><span>공식 대사 기간</span><div><input class="ui-control" id="reconciliationStartDate" type="date"><b>~</b><input class="ui-control" id="reconciliationEndDate" type="date"></div></label><button class="primary reconcile-run ui-btn primary" id="runReconcile" type="button">공식 대사 실행</button><label class="filter-chip ui-field"><span>대조 결과</span><select class="ui-control" id="reconciliationStatus"><option>전체</option><option>정상</option><option>확인필요</option><option>원장누락의심</option></select></label><label class="reconcile-search ui-field grow"><input class="feature-search ui-control" id="reconciliationSearch" type="search" placeholder="거래처 · 내용 검색"></label><button class="secondary reset-filter ui-btn outline" id="resetReconciliationFilters" type="button">필터 초기화</button></section>
    <section class="ui-card"><label class="ui-field"><span>대사 이력</span><select class="ui-control" id="reconciliationHistory"><option value="">대사 이력 없음</option></select></label></section>
    <section class="table-wrap compact-table reconciliation-table-wrap ui-table-wrap"><table class="reconciliation-table ui-table"><thead><tr><th>거래일</th><th>구분</th><th>계좌 거래</th><th>금액</th><th>연결 원장</th><th>상태</th><th>연결방식</th><th>관리</th></tr></thead><tbody id="reconciliationRows"></tbody></table><div class="reconcile-table-footer"><span id="reconciliationSummary">총 0건</span></div></section>
  </section></div><div class="toast ui-toast" id="toast">처리되었습니다.</div>
</div>
''')

write('src/400_accounting/420_reconciliation/accounting_reconciliation_js.html', r'''<script>
function fileToBankPayload(file) {
  return new Promise(function (resolve, reject) {
    const reader = new FileReader();
    reader.onload = function () {
      const value = String(reader.result || '');
      resolve({ file_name: file.name, file_type: file.type || 'application/octet-stream', file_size: file.size, content_base64: value.includes(',') ? value.split(',')[1] : value });
    };
    reader.onerror = function () { reject(new Error(file.name + ' 파일을 읽을 수 없습니다.')); };
    reader.readAsDataURL(file);
  });
}

function reconcileType(bank) { return bank && bank.expense ? '지출' : '수입'; }
function reconcileStatusClass(status) { return status === '정상' ? 'match-ok' : status === '원장누락의심' ? 'match-bad' : 'match-check'; }

function renderReconciliationDetail(detail) {
  state.reconciliationDetail = detail || { header: null, items: [] };
  const keyword = (document.getElementById('reconciliationSearch').value || '').toLowerCase();
  const status = document.getElementById('reconciliationStatus').value || '전체';
  const items = (state.reconciliationDetail.items || []).filter(function (item) {
    const searchable = [item.bank && item.bank.counterparty, item.bank && item.bank.description, item.ledger && item.ledger.counterparty, item.note].join(' ').toLowerCase();
    return (!keyword || searchable.includes(keyword)) && (status === '전체' || item.status === status);
  });
  document.getElementById('reconciliationSummary').textContent = '총 ' + items.length + '건 · 정상 ' + items.filter(function (x) { return x.status === '정상'; }).length + '건 · 확인 필요 ' + items.filter(function (x) { return x.status !== '정상'; }).length + '건';
  document.getElementById('reconciliationRows').innerHTML = items.length ? items.map(function (item) {
    const bank = item.bank || {};
    const ledger = item.ledger || {};
    const action = item.status === '확인필요' ? '<button class="small" data-action="link" data-id="' + item.id + '">수동 연결</button>' : item.status === '원장누락의심' ? '<button class="small" data-action="create" data-id="' + item.id + '">원장 생성</button>' : '-';
    return '<tr><td>' + escapeHtml(String(bank.transactionAt || '').slice(0,10)) + '</td><td>' + reconcileType(bank) + '</td><td>' + escapeHtml([bank.counterparty, bank.description].filter(Boolean).join(' · ')) + '</td><td>' + currency(bank.amount || 0) + '</td><td>' + escapeHtml(ledger.transaction_id ? [ledger.counterparty, ledger.description].filter(Boolean).join(' · ') : '-') + '</td><td><span class="match-pill ' + reconcileStatusClass(item.status) + '">' + escapeHtml(item.status) + '</span></td><td>' + escapeHtml(item.matchMethod || '-') + '</td><td>' + action + '</td></tr>';
  }).join('') : '<tr><td colspan="8" class="muted">대사 결과가 없습니다.</td></tr>';
}

async function refreshReconciliationHistory(selectId) {
  const list = await callServer('api_getReconciliationList', {}, { items: [] });
  state.reconciliationRuns = (list && list.items) || [];
  const select = document.getElementById('reconciliationHistory');
  select.innerHTML = state.reconciliationRuns.length ? state.reconciliationRuns.map(function (row) { return '<option value="' + escapeHtml(row.id) + '">' + escapeHtml(row.auditStartDate + ' ~ ' + row.auditEndDate + ' · ' + row.status) + '</option>'; }).join('') : '<option value="">대사 이력 없음</option>';
  const id = selectId || (state.reconciliationRuns[0] && state.reconciliationRuns[0].id);
  if (id) { select.value = id; const detail = await callServer('api_getReconciliationDetail', id, null, { strict: true }); renderReconciliationDetail(detail); }
  else renderReconciliationDetail(null);
}

async function uploadBankFiles() {
  const files = state.uploadFiles.reconciliation || [];
  if (!files.length) return toast('분석할 파일을 선택해 주세요.');
  try {
    const payloads = await Promise.all(files.map(fileToBankPayload));
    const result = await callServer('api_uploadBankTransactions', { files: payloads }, null, { strict: true });
    document.getElementById('ocrResultSummary').textContent = '저장 ' + (result.savedCount || 0) + '건 · 중복 ' + (result.duplicateCount || 0) + '건 · 검토 필요 ' + ((result.reviewRequiredItems || []).length) + '건 · 실패 파일 ' + (result.failedFileCount || 0) + '개';
    toast('계좌 파일 분석이 완료되었습니다.');
  } catch (error) { toast(error && error.message ? error.message : '파일 분석에 실패했습니다.'); }
}

async function runOfficialReconciliation() {
  const startDate = document.getElementById('reconciliationStartDate').value;
  const endDate = document.getElementById('reconciliationEndDate').value;
  if (!startDate || !endDate) return toast('대사 기간을 입력해 주세요.');
  try {
    const detail = await callServer('api_runReconciliation', { startDate: startDate, endDate: endDate }, null, { strict: true });
    renderReconciliationDetail(detail); await refreshReconciliationHistory(detail && detail.header && detail.header.id); toast('공식 감사대사가 저장되었습니다.');
  } catch (error) { toast(error && error.message ? error.message : '대사 실행에 실패했습니다.'); }
}

async function manuallyLink(itemId) {
  try {
    const result = await callServer('api_getReconciliationCandidates', { reconciliationItemId: itemId }, { items: [] }, { strict: true });
    const candidates = (result && result.items) || [];
    if (!candidates.length) return toast('연결할 수 있는 원장 후보가 없습니다.');
    const message = candidates.map(function (c, i) { return (i + 1) + '. ' + String(c.transactionAt || '').slice(0,10) + ' / ' + c.counterparty + ' / ' + currency(c.amount) + ' / ' + c.matchDetail; }).join('\n');
    const selected = Number(window.prompt('연결할 후보 번호를 입력하세요.\n' + message, '1')) - 1;
    if (selected < 0 || selected >= candidates.length) return;
    const detail = await callServer('api_linkReconciliation', { reconciliationItemId: itemId, ledgerId: candidates[selected].ledgerId }, null, { strict: true });
    renderReconciliationDetail(detail); await refreshReconciliationHistory(detail.header.id); toast('수동 연결되었습니다.');
  } catch (error) { toast(error && error.message ? error.message : '수동 연결에 실패했습니다.'); }
}

async function createLedgerForItem(itemId) {
  if (!window.confirm('이 계좌 거래를 기준으로 새 원장을 만들까요?')) return;
  try {
    const detail = await callServer('api_createLedgerFromReconciliation', { reconciliationItemId: itemId }, null, { strict: true });
    renderReconciliationDetail(detail); await refreshReconciliationHistory(detail.header.id); toast('원장을 생성하고 연결했습니다.');
  } catch (error) { toast(error && error.message ? error.message : '원장 생성에 실패했습니다.'); }
}

setupAccountingPageLinks();
setupFileUpload({ key: 'reconciliation', zoneId: 'reconciliationDropzone', inputId: 'reconciliationFile', nameId: 'reconciliationFileName', multiple: true });
document.getElementById('uploadBankTransactions').addEventListener('click', uploadBankFiles);
document.getElementById('runReconcile').addEventListener('click', runOfficialReconciliation);
document.getElementById('reconciliationHistory').addEventListener('change', async function (event) { if (event.target.value) renderReconciliationDetail(await callServer('api_getReconciliationDetail', event.target.value, null, { strict: true })); });
['reconciliationSearch','reconciliationStatus'].forEach(function (id) { document.getElementById(id).addEventListener('input', function () { renderReconciliationDetail(state.reconciliationDetail); }); });
document.getElementById('resetReconciliationFilters').addEventListener('click', function () { document.getElementById('reconciliationSearch').value = ''; document.getElementById('reconciliationStatus').value = '전체'; renderReconciliationDetail(state.reconciliationDetail); });
document.getElementById('reconciliationRows').addEventListener('click', function (event) { const button = event.target.closest('[data-action]'); if (!button) return; if (button.dataset.action === 'link') manuallyLink(button.dataset.id); if (button.dataset.action === 'create') createLedgerForItem(button.dataset.id); });
refreshReconciliationHistory();
</script>
''')

# Settlement view + JS: period overall only, immutable history.
write('src/400_accounting/430_settlement/Accounting_Settlement_View.html', r'''<div class="accounting-page">
  <section class="page-head ui-page-head"><div><p class="breadcrumb">장부관리 / 결산 보고서</p><h1>전체 결산 보고서</h1><p class="desc">정상 상태의 활성 원장만 기간 기준으로 집계해 불변 스냅샷을 생성합니다.</p></div></section>
  <nav class="accounting-tabs ui-tabs" aria-label="회계관리 화면"><a class="ui-tab" data-accounting-page="accounting_ledger">수입·지출 관리</a><a class="ui-tab" data-accounting-page="accounting_reconciliation">계좌·장부 대조</a><a class="active ui-tab" data-accounting-page="accounting_settlement">결산 보고서</a></nav>
  <div class="workspace"><section class="feature-view" id="settlementView">
    <section class="settlement-summary-grid"><article class="settlement-summary-card income-card ui-stat-card success"><span class="summary-icon">↓</span><div><p>총 수입</p><strong id="settlementIncome">₩0</strong><small id="settlementIncomeCount">건수 0건</small></div></article><article class="settlement-summary-card expense-card ui-stat-card danger"><span class="summary-icon">↑</span><div><p>총 지출</p><strong id="settlementExpense">₩0</strong><small id="settlementExpenseCount">건수 0건</small></div></article><article class="settlement-summary-card balance-card ui-stat-card neutral"><span class="summary-icon">₩</span><div><p>기간 잔액</p><strong id="settlementBalance">₩0</strong><small>수입 - 지출</small></div></article><article class="settlement-summary-card event-card ui-stat-card info"><span class="summary-icon">▣</span><div><p>증빙 수</p><strong id="settlementEvidenceCount">0건</strong><small>결산 포함 거래 기준</small></div></article></section>
    <article class="settlement-setting-panel ui-card"><div class="setting-title-row"><h2>결산 기간</h2></div><div class="settlement-form-row"><label class="setting-field settlement-period ui-field"><span>회계 기간 <b>*</b></span><div><input class="ui-control" id="settlementStartDate" type="date"><em>~</em><input class="ui-control" id="settlementEndDate" type="date"></div></label><button class="secondary ui-btn outline" id="refreshSettlement" type="button">집계 조회</button><button class="primary settlement-generate ui-btn primary" id="generateSettlement" type="button">스냅샷 생성</button></div></article>
    <article class="ui-card"><div class="setting-title-row"><h2>결산 이력</h2></div><div class="settlement-form-row"><label class="ui-field grow"><select class="ui-control" id="settlementHistory"><option value="">결산 이력 없음</option></select></label><button class="secondary ui-btn outline" id="exportSettlement" type="button">Export 데이터</button></div><pre id="settlementExportPreview" class="muted"></pre></article>
  </section></div><div class="toast ui-toast" id="toast">처리되었습니다.</div>
</div>
''')

write('src/400_accounting/430_settlement/accounting_settlement_js.html', r'''<script>
function settlementPeriod() { return { startDate: document.getElementById('settlementStartDate').value, endDate: document.getElementById('settlementEndDate').value }; }
function renderSettlement(summary) {
  summary = summary || {};
  document.getElementById('settlementIncome').textContent = currency(summary.totalIncome || 0);
  document.getElementById('settlementExpense').textContent = currency(summary.totalExpense || 0);
  document.getElementById('settlementBalance').textContent = currency(summary.balance || 0);
  document.getElementById('settlementIncomeCount').textContent = '건수 ' + (summary.incomeCount || 0) + '건';
  document.getElementById('settlementExpenseCount').textContent = '건수 ' + (summary.expenseCount || 0) + '건';
  document.getElementById('settlementEvidenceCount').textContent = (summary.evidenceCount || 0) + '건';
}
async function refreshSettlementSummary() {
  const period = settlementPeriod();
  if (!period.startDate || !period.endDate) return;
  renderSettlement(await callServer('api_getSettlementSummary', period, {}, { strict: true }));
}
async function refreshSettlementHistory(selectId) {
  const list = await callServer('api_getSettlementReportList', {}, { items: [] });
  const items = (list && list.items) || [];
  state.settlementReports = items;
  const select = document.getElementById('settlementHistory');
  select.innerHTML = items.length ? items.map(function (row) { return '<option value="' + escapeHtml(row.id) + '">' + escapeHtml(row.startDate + ' ~ ' + row.endDate + ' · ' + row.status) + '</option>'; }).join('') : '<option value="">결산 이력 없음</option>';
  if (selectId) select.value = selectId;
  if (select.value) { const report = await callServer('api_getSettlementReport', select.value, null, { strict: true }); if (report) renderSettlement(report); }
}
async function generateSettlement() {
  const period = settlementPeriod();
  if (!period.startDate || !period.endDate) return toast('결산 기간을 입력해 주세요.');
  try { const report = await callServer('api_generateSettlementReport', period, null, { strict: true }); renderSettlement(report); await refreshSettlementHistory(report.id); toast('결산 스냅샷이 생성되었습니다.'); }
  catch (error) { toast(error && error.message ? error.message : '결산 생성에 실패했습니다.'); }
}
async function exportSettlement() {
  const id = document.getElementById('settlementHistory').value;
  if (!id) return toast('내보낼 결산 이력을 선택해 주세요.');
  try { const data = await callServer('api_exportSettlementReport', { reportId: id }, null, { strict: true }); document.getElementById('settlementExportPreview').textContent = JSON.stringify(data, null, 2); toast('Export용 데이터를 불러왔습니다.'); }
  catch (error) { toast(error && error.message ? error.message : 'Export 데이터를 불러오지 못했습니다.'); }
}
setupAccountingPageLinks();
document.getElementById('refreshSettlement').addEventListener('click', refreshSettlementSummary);
document.getElementById('generateSettlement').addEventListener('click', generateSettlement);
document.getElementById('settlementHistory').addEventListener('change', async function (event) { if (!event.target.value) return; const report = await callServer('api_getSettlementReport', event.target.value, null, { strict: true }); if (report) renderSettlement(report); });
document.getElementById('exportSettlement').addEventListener('click', exportSettlement);
refreshSettlementHistory();
</script>
''')

# Extend UI verifier with server-call contract checks and required new IDs.
path = 'scripts/verify-ui-system-migration.js'
verifier = read(path)
insert = r'''

function verifyAccountingServerContracts() {
  const ledger = read('src/400_accounting/410_ledger/accounting_ledger_js.html');
  ['api_getLedgerSummary','api_getLedgerList','api_saveLedgerDraft','api_updateLedgerEntry','api_deleteLedgerEntry'].forEach((name) => {
    if (!ledger.includes(name)) failures.push(`Accounting ledger client missing ${name}`);
  });
  const reconciliation = read('src/400_accounting/420_reconciliation/accounting_reconciliation_js.html');
  ['api_uploadBankTransactions','api_runReconciliation','api_getReconciliationList','api_getReconciliationDetail','api_getReconciliationCandidates','api_linkReconciliation','api_createLedgerFromReconciliation'].forEach((name) => {
    if (!reconciliation.includes(name)) failures.push(`Accounting reconciliation client missing ${name}`);
  });
  const settlement = read('src/400_accounting/430_settlement/accounting_settlement_js.html');
  ['api_getSettlementSummary','api_generateSettlementReport','api_getSettlementReportList','api_getSettlementReport','api_exportSettlementReport'].forEach((name) => {
    if (!settlement.includes(name)) failures.push(`Accounting settlement client missing ${name}`);
  });
  [ledger, reconciliation, settlement].forEach((source) => {
    if (source.includes('apiV1_')) failures.push('Accounting client still references legacy apiV1_ contract');
  });
  if (/generateSettlement['"]\)\.disabled\s*=\s*true/.test(settlement)) failures.push('Settlement generation remains forcibly disabled');
}
'''
verifier = verifier.replace('\nfunction verifyEvent() {', insert + '\nfunction verifyEvent() {')
verifier = verifier.replace("  if (domain === 'accounting') verifyAccounting();", "  if (domain === 'accounting') { verifyAccounting(); verifyAccountingServerContracts(); }")
write(path, verifier)

print('Accounting UI patch applied.')
