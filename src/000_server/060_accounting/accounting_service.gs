/** 회계 서비스와 화면 DTO 변환 */

// TODO(장부 권한): UserDB의 장부 권한 ID 확정 후 동작별 권한을 검사한다.

// 1. 장부 저장
function saveLedgerEntry_(request) {
  var context = requireLoginContext_();
  var now = getCurrentIsoDateTime_();
  var item = {
    id: request.transaction_id || makeId_('TRX'),
    transactionAt: request.transaction_date || now,
    description: request.description || '',
    expense: request.transaction_type === '지출',
    amount: Number(request.amount || 0),
    balanceAfter: Number(request.balance_after || 0),
    counterparty: request.counterparty || '',
    source: request.source || '수기등록',
    eventId: request.event_id || '',
    businessType: request.business_type || '일반',
    businessId: request.business_id || '',
    matchStatus: request.match_status || '미확인',
    managerId: context.user && context.user.email ? context.user.email : getCurrentUserName_(),
    createdAt: now,
    updatedAt: now
  };
  appendOperationTableRow_('ledger', item);
  var evidence = saveEvidenceFiles_(item.id, request.evidence_files || request.evidence || [], now);
  return { ok: true, evidence: evidence, item: getLedgerEntryDto_(item) };
}

// 2. 장부 조회와 화면 DTO 변환
function getLedgerEntries_() {
  var evidenceByTransaction = groupBy_(readOperationTableRows_('evidence'), 'transactionId');
  var eventsById = readOperationTableRows_('events').reduce(function (index, event) {
    index[event.id] = event;
    return index;
  }, {});
  return readOperationTableRows_('ledger').map(function (item) {
    var dto = getLedgerEntryDto_(item);
    dto.event_name = eventsById[item.eventId] ? eventsById[item.eventId].name : '해당없음';
    dto.evidence = (evidenceByTransaction[item.id] || []).map(getEvidenceDto_);
    dto.has_evidence = dto.evidence.length > 0;
    return dto;
  }).sort(function (a, b) {
    return String(b.transaction_date).localeCompare(String(a.transaction_date));
  });
}

function getLedgerEntryDto_(item) {
  return {
    transaction_id: item.id,
    transaction_type: isTruthyValue_(item.expense) ? '지출' : '수입',
    transaction_date: formatDateTimeValue_(item.transactionAt),
    department_id: '',
    department_name: '',
    amount: Number(item.amount || 0),
    counterparty: item.counterparty || '',
    event_id: item.eventId || '',
    description: item.description || '',
    note: '',
    manager: item.managerId || '',
    status: item.matchStatus || '미확인',
    has_evidence: false,
    evidence: [],
    alert: '',
    created_at: formatDateTimeValue_(item.createdAt),
    updated_at: formatDateTimeValue_(item.updatedAt),
    is_deleted: false
  };
}

function getEvidenceDto_(item) {
  return {
    evidence_id: item.id,
    transaction_id: item.transactionId,
    file_name: item.fileName,
    file_id: item.driveFileId,
    file_path: item.driveFileId ? 'https://drive.google.com/open?id=' + item.driveFileId : '',
    created_at: formatDateTimeValue_(item.createdAt),
    updated_at: formatDateTimeValue_(item.createdAt),
    is_deleted: false
  };
}

// 4. 목록 필터
function filterLedgerEntries_(items, filter) {
  var normalized = normalizeFilter_(filter || {});
  var keyword = String(normalized.keyword).toLowerCase();
  return items.filter(function (item) {
    if (keyword && [item.counterparty, item.description, item.manager].join(' ').toLowerCase().indexOf(keyword) < 0) return false;
    if (normalized.transaction_type !== '전체' && item.transaction_type !== normalized.transaction_type) return false;
    if (normalized.event_name !== '전체' && item.event_name !== normalized.event_name) return false;
    if (normalized.status !== '전체' && item.status !== normalized.status) return false;
    return true;
  });
}

function normalizeFilter_(filter) {
  return {
    keyword: filter.keyword || '',
    transaction_type: filter.transaction_type || filter.type || '전체',
    event_name: filter.event_name || filter.event || '전체',
    status: filter.status || '전체'
  };
}

// 5. 공통 변환
function groupBy_(items, key) {
  return items.reduce(function (group, item) {
    var value = item[key];
    if (!group[value]) group[value] = [];
    group[value].push(item);
    return group;
  }, {});
}

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
