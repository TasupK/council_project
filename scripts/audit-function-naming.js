var fs = require('fs');
var path = require('path');

var ROOT = path.resolve(__dirname, '..');
var SERVER = path.join(ROOT, 'src/000_server');

function listFiles_(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).reduce(function (all, entry) {
    var target = path.join(dir, entry.name);
    if (entry.isDirectory()) return all.concat(listFiles_(target));
    if (/\.gs$/.test(entry.name)) all.push(target);
    return all;
  }, []);
}

function collectFunctions_(file) {
  var source = fs.readFileSync(file, 'utf8');
  var pattern = /function\s+([A-Za-z_$][\w$]*)\s*\(/g;
  var out = [];
  var match;
  while ((match = pattern.exec(source)) !== null) out.push(match[1]);
  return out;
}

listFiles_(SERVER).sort().forEach(function (file) {
  collectFunctions_(file).forEach(function (name) {
    console.log(path.relative(ROOT, file).replace(/\\/g, '/') + '\t' + name);
  });
});
