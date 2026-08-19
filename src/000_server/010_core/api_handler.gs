// 1. 보호 API 공통 실행 흐름
function apiHandler_(options) {
  var operation = options && options.operation ? options.operation : 'unknown';
  var context = null;
  var request;

  try {
    if (options && options.access && options.permission) {
      throw new Error('API는 access와 permission을 동시에 선언할 수 없습니다.');
    }

    if (options && options.requireLogin) {
      context = requireLoginContext_();
    }

    if (options && options.access) {
      resolveApiAccess_(context, options.access);
    } else if (options && options.permission) {
      requirePermission_(context, options.permission);
    }

    request = options && options.parse ? options.parse(options.input) : options.input;
    return options.service(request, context);
  } catch (e) {
    console.error('[' + operation + '] API execution failed.', e && e.stack ? e.stack : e);
    throw e;
  }
}
