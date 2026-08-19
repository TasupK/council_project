var fs = require('fs');
var path = require('path');

function listFiles(directory, predicate) {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { withFileTypes: true }).reduce(function (files, entry) {
    var target = path.join(directory, entry.name);
    if (entry.isDirectory()) return files.concat(listFiles(target, predicate));
    if (predicate(target)) files.push(target);
    return files;
  }, []);
}

function lineNumber(source, index) {
  return source.slice(0, index).split('\n').length;
}

function collectServerApis(source, serverPath) {
  var pattern = /function\s+(api_[A-Za-z0-9_]+)\s*\(([^)]*)\)/g;
  var result = [];
  var match;
  while ((match = pattern.exec(source)) !== null) {
    var params = match[2].trim() ? match[2].split(',').map(function (value) { return value.trim(); }) : [];
    result.push({ name: match[1], params: params, path: serverPath, line: lineNumber(source, match.index) });
  }
  return result;
}

function collectStaticApiReferences(source, frontendPath) {
  var pattern = /\bapi_[A-Za-z0-9_]+\b/g;
  var result = [];
  var match;
  while ((match = pattern.exec(source)) !== null) {
    result.push({ name: match[0], path: frontendPath, line: lineNumber(source, match.index) });
  }
  return result;
}

function findMatching(source, openIndex, openChar, closeChar) {
  var depth = 0;
  var quote = '';
  var escaped = false;
  for (var index = openIndex; index < source.length; index += 1) {
    var char = source[index];
    if (quote) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === quote) quote = '';
      continue;
    }
    if (char === '\'' || char === '"' || char === '`') {
      quote = char;
      continue;
    }
    if (char === openChar) depth += 1;
    if (char === closeChar) {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  return -1;
}

function splitTopLevelArgs(source) {
  var args = [];
  var start = 0;
  var round = 0;
  var square = 0;
  var curly = 0;
  var quote = '';
  var escaped = false;
  for (var index = 0; index < source.length; index += 1) {
    var char = source[index];
    if (quote) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === quote) quote = '';
      continue;
    }
    if (char === '\'' || char === '"' || char === '`') { quote = char; continue; }
    if (char === '(') round += 1;
    else if (char === ')') round -= 1;
    else if (char === '[') square += 1;
    else if (char === ']') square -= 1;
    else if (char === '{') curly += 1;
    else if (char === '}') curly -= 1;
    else if (char === ',' && round === 0 && square === 0 && curly === 0) {
      args.push(source.slice(start, index).trim());
      start = index + 1;
    }
  }
  var tail = source.slice(start).trim();
  if (tail || source.trim()) args.push(tail);
  return args;
}

function extractFunctionBodies(source) {
  var pattern = /function\s+([A-Za-z_$][\w$]*)\s*\(([^)]*)\)\s*\{/g;
  var result = [];
  var match;
  while ((match = pattern.exec(source)) !== null) {
    var open = source.indexOf('{', match.index);
    var close = findMatching(source, open, '{', '}');
    if (close < 0) continue;
    result.push({
      name: match[1],
      params: match[2].trim() ? match[2].split(',').map(function (value) { return value.trim(); }) : [],
      start: match.index,
      end: close + 1,
      body: source.slice(open + 1, close)
    });
    pattern.lastIndex = close + 1;
  }
  return result;
}

function collectDispatchers(source, frontendPath) {
  return extractFunctionBodies(source).reduce(function (items, fn) {
    fn.params.forEach(function (param, paramIndex) {
      var escaped = param.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      var bracketPattern = new RegExp('\\[\\s*' + escaped + '\\s*\\]');
      if (bracketPattern.test(fn.body)) {
        items.push({ name: fn.name, paramIndex: paramIndex, path: frontendPath, start: fn.start, end: fn.end });
      }
    });
    return items;
  }, []);
}

function unquoteLiteral(value) {
  var match = /^(['"])(api_[A-Za-z0-9_]+)\1$/.exec(value.trim());
  return match ? match[2] : '';
}

function collectDispatcherCalls(source, frontendPath, dispatchers) {
  var staticCalls = [];
  var dynamicCalls = [];
  dispatchers.forEach(function (dispatcher) {
    var pattern = new RegExp('\\b' + dispatcher.name.replace(/[$]/g, '\\$&') + '\\s*\\(', 'g');
    var match;
    while ((match = pattern.exec(source)) !== null) {
      var prefix = source.slice(Math.max(0, match.index - 20), match.index);
      if (/function\s*$/.test(prefix)) continue;
      if (match.index >= dispatcher.start && match.index < dispatcher.end && frontendPath === dispatcher.path) continue;
      var open = source.indexOf('(', match.index);
      var close = findMatching(source, open, '(', ')');
      if (close < 0) continue;
      var args = splitTopLevelArgs(source.slice(open + 1, close));
      var targetArg = args[dispatcher.paramIndex] || '';
      var apiName = unquoteLiteral(targetArg);
      if (apiName) {
        staticCalls.push({ name: apiName, path: frontendPath, line: lineNumber(source, match.index), via: dispatcher.name });
      } else if (targetArg) {
        dynamicCalls.push({ expression: targetArg, path: frontendPath, line: lineNumber(source, match.index), via: dispatcher.name });
      }
      pattern.lastIndex = close + 1;
    }
  });
  return { staticCalls: staticCalls, dynamicCalls: dynamicCalls };
}

function collectDirectDynamicCalls(source, frontendPath, dispatcherRanges) {
  var result = [];
  var patterns = [
    /google\.script\.run[\s\S]{0,500}?\[\s*([A-Za-z_$][\w$]*)\s*\]/g,
    /\brunner\s*\[\s*([A-Za-z_$][\w$]*)\s*\]/g
  ];
  patterns.forEach(function (pattern) {
    var match;
    while ((match = pattern.exec(source)) !== null) {
      var insideDispatcher = dispatcherRanges.some(function (range) {
        return range.path === frontendPath && match.index >= range.start && match.index < range.end;
      });
      if (!insideDispatcher) {
        result.push({ expression: match[1], path: frontendPath, line: lineNumber(source, match.index), via: 'direct' });
      }
    }
  });
  return result;
}

function auditSources(frontendSources, serverSources) {
  var serverApis = [];
  serverSources.forEach(function (item) {
    serverApis = serverApis.concat(collectServerApis(item.source, item.path));
  });
  var serverNames = {};
  serverApis.forEach(function (api) { serverNames[api.name] = api; });

  var dispatchers = [];
  frontendSources.forEach(function (item) {
    dispatchers = dispatchers.concat(collectDispatchers(item.source, item.path));
  });

  var references = [];
  var dynamicCalls = [];
  frontendSources.forEach(function (item) {
    references = references.concat(collectStaticApiReferences(item.source, item.path));
    var dispatcherCalls = collectDispatcherCalls(item.source, item.path, dispatchers);
    references = references.concat(dispatcherCalls.staticCalls);
    dynamicCalls = dynamicCalls.concat(dispatcherCalls.dynamicCalls);
    dynamicCalls = dynamicCalls.concat(collectDirectDynamicCalls(item.source, item.path, dispatchers));
  });

  var seenReference = {};
  references.forEach(function (ref) { seenReference[ref.name] = true; });

  var missingServerApis = references.filter(function (ref, index, items) {
    if (serverNames[ref.name]) return false;
    return items.findIndex(function (candidate) { return candidate.name === ref.name && candidate.path === ref.path && candidate.line === ref.line; }) === index;
  });

  var unusedServerApis = serverApis.filter(function (api) { return !seenReference[api.name]; });

  return {
    serverApis: serverApis,
    frontendReferences: references,
    missingServerApis: missingServerApis,
    dynamicCalls: dynamicCalls,
    unusedServerApis: unusedServerApis
  };
}

function auditSourcePair(frontendSource, serverSource, options) {
  options = options || {};
  return auditSources(
    [{ source: frontendSource, path: options.frontendPath || 'frontend.html' }],
    [{ source: serverSource, path: options.serverPath || 'server.gs' }]
  );
}

function auditRepository(root) {
  var srcRoot = path.join(root, 'src');
  var serverRoot = path.join(srcRoot, '000_server');
  var frontendFiles = listFiles(srcRoot, function (file) {
    return file.indexOf(serverRoot + path.sep) !== 0 && /\.(html|js)$/.test(file);
  });
  var serverFiles = listFiles(serverRoot, function (file) { return /\.gs$/.test(file); });
  var frontendSources = frontendFiles.map(function (file) {
    return { source: fs.readFileSync(file, 'utf8'), path: path.relative(root, file).replace(/\\/g, '/') };
  });
  var serverSources = serverFiles.map(function (file) {
    return { source: fs.readFileSync(file, 'utf8'), path: path.relative(root, file).replace(/\\/g, '/') };
  });
  return auditSources(frontendSources, serverSources);
}

function formatAuditFailures(result) {
  var lines = [];
  result.missingServerApis.forEach(function (item) {
    lines.push('Missing server API: ' + item.name + ' referenced at ' + item.path + ':' + item.line);
  });
  result.dynamicCalls.forEach(function (item) {
    lines.push('Unresolved dynamic API dispatch: ' + item.expression + ' at ' + item.path + ':' + item.line + ' via ' + item.via);
  });
  return lines.join('\n');
}

module.exports = {
  auditSourcePair: auditSourcePair,
  auditRepository: auditRepository,
  formatAuditFailures: formatAuditFailures,
  collectServerApis: collectServerApis
};

if (require.main === module) {
  var result = auditRepository(path.resolve(__dirname, '..'));
  var failures = formatAuditFailures(result);
  if (failures) {
    console.error(failures);
    process.exitCode = 1;
  } else {
    console.log('Frontend API mapping verification passed.');
    console.log('Mapped frontend API references: ' + result.frontendReferences.length);
    console.log('Server public APIs not referenced by frontend: ' + result.unusedServerApis.length);
  }
}
