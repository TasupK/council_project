// 1. 목록 페이지네이션
function paginateEventItems_(items, request) {
  var page = Math.max(1, Number(request && request.page) || 1);
  var pageSize = Math.min(
    EVENT_MAX_PAGE_SIZE,
    Math.max(1, Number(request && request.pageSize) || EVENT_DEFAULT_PAGE_SIZE)
  );
  var totalCount = items.length;
  var totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  var safePage = Math.min(page, totalPages);
  var offset = (safePage - 1) * pageSize;
  return {
    items: items.slice(offset, offset + pageSize).map(withoutInternalRowNumber_),
    page: safePage,
    pageSize: pageSize,
    totalCount: totalCount,
    totalPages: totalPages
  };
}
