const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const required = [
  'src/frontend/pages/student_fee_payers/Student_Fee_Payers.html',
  'src/frontend/pages/student_fee_payers/Student_Fee_Payers_View.html',
  'src/frontend/pages/student_fee_payers/modals/Student_Fee_Payer_Edit_Modal.html',
  'src/frontend/pages/student_fee_payers/student_fee_payers_controller_js.html',
  'src/frontend/features/student_fee_payer_manage/student_fee_payer_manage_js.html',
  'src/frontend/entities/student_fee_payer/api/student_fee_payer_client_js.html'
];
required.forEach(function (rel) { assert.ok(fs.existsSync(path.join(root, rel)), 'missing Student Fee Payers FSD file: ' + rel); });
assert.ok(!fs.existsSync(path.join(root, 'src/500_student_fee/510_payers')), 'legacy Student Fee Payers slice must be removed');

const shell = fs.readFileSync(path.join(root, required[0]), 'utf8');
const feature = fs.readFileSync(path.join(root, required[4]), 'utf8');
const client = fs.readFileSync(path.join(root, required[5]), 'utf8');
const router = fs.readFileSync(path.join(root, 'src/backend/app/routing/Code.js'), 'utf8');

assert.ok(shell.includes("include('frontend/entities/student_fee_payer/api/student_fee_payer_client_js')"));
assert.ok(shell.includes("include('frontend/features/student_fee_payer_manage/student_fee_payer_manage_js')"));
assert.ok(shell.includes("include('frontend/pages/student_fee_payers/student_fee_payers_controller_js')"));
assert.ok(feature.includes('studentFeePayerClient.getPayers('));
assert.ok(feature.includes('studentFeePayerClient.createPayer('));
assert.ok(feature.includes('studentFeePayerClient.updatePayer('));
assert.ok(!feature.includes('google.script.run'));
assert.ok(client.includes("runAppApi('api_getStudentFeePayers'"));
assert.ok(client.includes("runAppApi('api_createStudentFeePayer'"));
assert.ok(client.includes("runAppApi('api_updateStudentFeePayer'"));
assert.ok(router.includes("student_fee_payers: 'frontend/pages/student_fee_payers/Student_Fee_Payers'"));

console.log('Student Fee Payers FSD migration contract: PASS');
