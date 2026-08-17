from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
path = ROOT / 'scripts/test-accounting.js'
text = path.read_text(encoding='utf-8')
needle = "  context.DriveApp = { getFileById: function () { return { setTrashed: function () {} }; } };\n"
replacement = needle + "  context.appendOperationTableRow_ = function () { return true; };\n  context.updateOperationTableRow_ = function () { return true; };\n"
if needle not in text:
    raise RuntimeError('test harness insertion point not found')
path.write_text(text.replace(needle, replacement, 1), encoding='utf-8')
print('Accounting server test harness fixed.')
