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

function stripCommentsPreserveLines(source) {
  var output = '';
  var quote = '';
  var escaped = false;
  var lineComment = false;
  var blockComment = false;

  for (var index = 0; index < source.length; index += 1) {
    var char = source[index];
    var next = source[index + 1] || '';

    if (lineComment) {
      if (char === '\n') {
        lineComment = false;
        output += '\n';
      } else {
        output += ' ';
      }
      continue;
    }

    if (blockComment) {
      if (char === '*' && next === '/') {
        output += '  ';
        index += 1;
        blockComment = false;
      } else {
        output += char === '\n' ? '\n' : ' ';
      }
      continue;
    }

    if (quote) {
      output += char;
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === quote) quote = '';
      continue;
    }

    if (char === '\'' || char === '"' || char === '`') {
      quote = char;
      output += char;
      continue;
    }

    if (char === '/' && next === '/') {
      output += '  ';
      index += 1;
      lineComment = true;
      continue;
    }

    if (char === '/' && next === '*') {
      output += '  ';
      index += 1;
      blockComment = true;
      continue;
    }

    output += char;
  }

  return output;
}

function collectServerApis(source, serverPath) {
  var cleaned = stripCommentsPreserveLines(source);
  var pattern = /function\s+(api_[A-Za-z0-9_]+)\s*\(([^)]*)\)/g;
  var result = [];
  var match;
  while ((match = pattern.exec(cleaned)) !== null) {
    var params = match[2].trim() ? match[2].split(',').map(function (value) { return value.trim(); }) : [];
    result.push({ name: match[1], params: params, path: serverPath, line: lineNumber(cleaned, match.index) });
  }
  return result;
}

function collectStaticApiReferences(source, frontendPath) {
  var cleaned = stripCommentsPreserveLines(source);
  var pattern = /\bapi_[A-Za-z0-9_]+\b/g;
  var result = [];
  var match;
  while ((match = pattern.exec(cleaned)) !== null) {
    result.push({ name: match[0], path: frontendPath, line: lineNumber(cleaned, match.index) });
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

function collectGasDispatchers(source, frontendPath) {
  var cleaned = stripCommentsPreserveLines(source);
  return extractFunctionBodies(cleaned).reduce(function (items, fn) {
    if (!/(?:google|gas)\.script\.run|\brunner\b/.test(fn.body)) return items;
    fn.params.forEach(function (param) {
      var escaped = param.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      var bracketPattern = new RegExp('\\[\\s*' + escaped + '\\s*\\]');
      if (bracketPattern.test(fn.body)) {
        items.push({ name: fn.name, param: param, path: frontendPath, start: fn.start, end: fn.end });
      }
    });
    return items;
  }, []);
}

function collectDirectDynamicCalls(source, frontendPath, dispatcherRanges) {
  var cleaned = stripCommentsPreserveLines(source);
  var result = [];
  var patterns = [
    /google\.script\.run[\s\S]{0,500}?\[\s*([A-Za-z_$][\w$]*)\s*\]/g,
    /\brunner\s*\[\s*([A-Za-z_$][\w$]*)\s*\]/g
  ];
  patterns.forEach(function (pattern) {
    var match;
    while ((match = pattern.exec(cleaned)) !== null) {
      var insideDispatcher = dispatcherRanges.some(function (range) {
        return range.path === frontendPath && match.index >= range.start && match.index < range.end;
      });
      if (!insideDispatcher) {
        result.push({ expression: match[1], path: frontendPath, line: lineNumber(cleaned, match.index), via: 'direct' });
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
    dispatchers = dispatchers.concat(collectGasDispatchers(item.source, item.path));
  });

  var references = [];
  var dynamicCalls = [];
  frontendSources.forEach(function (item) {
    references = references.concat(collectStaticApiReferences(item.source, item.path));
    dynamicCalls = dynamicCalls.concat(collectDirectDynamicCalls(item.source, item.path, dispatchers));
  });

  var seenReference = {};
  references.forEach(function (ref) { seenReference[ref.name] = true; });

  var missingServerApis = references.filter(function (ref, index, items) {
    if (serverNames[ref.name]) return false;
    return items.findIndex(function (candidate) {
      return candidate.name === ref.name && candidate.path === ref.path && candidate.line === ref.line;
    }) === index;
  });

  var unusedServerApis = serverApis.filter(function (api) { return !seenReference[api.name]; });

  return {
    serverApis: serverApis,
    frontendReferences: references,
    missingServerApis: missingServerApis,
    dynamicCalls: dynamicCalls,
    dynamicDispatchers: dispatchers,
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
    lines.push('Unresolved dynamic API dispatch: ' + item.expression + ' at ' + item.path + ':' + item.line);
  });
  return lines.join('\n');
}

module.exports = {
  auditSourcePair: auditSourcePair,
  auditRepository: auditRepository,
  formatAuditFailures: formatAuditFailures,
  collectServerApis: collectServerApis,
  stripCommentsPreserveLines: stripCommentsPreserveLines
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
    console.log('Recognized GAS dynamic dispatch wrappers: ' + result.dynamicDispatchers.length);
    console.log('Server public APIs not referenced by frontend: ' + result.unusedServerApis.length);
    if (result.unusedServerApis.length) {
      result.unusedServerApis.forEach(function (api) {
        console.log('  - ' + api.name + ' (' + api.path + ':' + api.line + ')');
      });
    }
  }
}
