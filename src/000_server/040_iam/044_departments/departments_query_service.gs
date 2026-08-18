// 1. 부서 시트 행을 화면/API 응답용 객체로 변환
function mapDepartmentDto_(row) {
  var fields = getUserDbFields_('departments');
  var order = Number(row[fields.sortOrder]);
  return {
    id: normalizeTextValue_(row[fields.id]),
    name: normalizeTextValue_(row[fields.name]),
    type: normalizeTextValue_(row[fields.type]),
    sortOrder: isNaN(order) ? 0 : order,
    status: isTruthyValue_(row[fields.active]) ? 'active' : 'inactive'
  };
}

// 2. 부서ID 기준 부서 맵 생성
function buildDepartmentsById_() {
  var map = {};
  listDepartmentRows_().forEach(function (row) {
    var department = mapDepartmentDto_(row);
    if (department.id) map[department.id] = department;
  });
  return map;
}

// 3. 활성 부서 목록 조회
function listActiveDepartments_() {
  return listDepartmentRows_()
    .map(mapDepartmentDto_)
    .filter(function (department) { return department.id && department.status === 'active'; })
    .sort(function (a, b) {
      if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
      return a.name.localeCompare(b.name);
    });
}
