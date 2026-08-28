const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const runnerPath = path.join(root, 'src/frontend/shared/api/app_api_runner_js.html');
assert.ok(fs.existsSync(runnerPath), 'shared app API runner must exist');

function loadRunner(fakeGoogle) {
  const source = fs.readFileSync(runnerPath, 'utf8').replace(/^<script>\s*/, '').replace(/\s*<\/script>\s*$/, '');
  const context = vm.createContext({ google: fakeGoogle, Promise, JSON, Object, String, Error });
  vm.runInContext(source, context, { filename: runnerPath });
  return context;
}
function makeGas(mode, value, received) {
  const runner = {_success:null,_failure:null,withSuccessHandler:function(handler){this._success=handler;return this;},withFailureHandler:function(handler){this._failure=handler;return this;}};
  return { script: { run: new Proxy(runner, { get: function (target, prop) { if (prop in target) return target[prop]; return function (payload) { received.push({ name: String(prop), payload: payload }); if (mode === 'success') target._success(value); else target._failure(value); }; } }) } };
}
(async function () {
  let received = []; let context = loadRunner(makeGas('success', { ok:true, data:{value:1} }, received)); let data = await context.runAppApi('api_ping', { id:'A' });
  assert.deepStrictEqual(JSON.parse(JSON.stringify(data)), { value:1 }); assert.deepStrictEqual(JSON.parse(JSON.stringify(received)), [{ name:'api_ping', payload:{ request:{id:'A'} } }]);
  received=[]; context=loadRunner(makeGas('success',{ok:true,data:null},received)); data=await context.runAppApi('api_ping'); assert.strictEqual(data,null); assert.deepStrictEqual(JSON.parse(JSON.stringify(received[0].payload)),{request:{}});
  received=[]; context=loadRunner(makeGas('success',{value:1},received)); await assert.rejects(context.runAppApi('api_ping',{}), error => error && error.code==='INVALID_API_RESPONSE');
  const transported=new Error('__APP_ERROR__:'+JSON.stringify({code:'NOT_FOUND',message:'행사를 찾을 수 없습니다.',details:{id:'A'}})); received=[]; context=loadRunner(makeGas('failure',transported,received)); await assert.rejects(context.runAppApi('api_ping',{}), error => error && error.code==='NOT_FOUND' && error.message==='행사를 찾을 수 없습니다.' && error.details.id==='A');
  const wrappedTransported=new Error('Error: __APP_ERROR__:'+JSON.stringify({code:'FORBIDDEN',message:'요청한 업무 권한을 찾을 수 없습니다.',details:{}})); received=[]; context=loadRunner(makeGas('failure',wrappedTransported,received)); await assert.rejects(context.runAppApi('api_ping',{}), error => error && error.code==='FORBIDDEN' && error.message==='요청한 업무 권한을 찾을 수 없습니다.');

  const migrated = new Set([
    'src/frontend/pages/main/Main.html','src/frontend/pages/mypage/MyPage.html','src/frontend/pages/settings_home/Settings_Home.html','src/frontend/pages/settings_users/Settings_Users.html','src/frontend/pages/settings_roles/Settings_Roles.html','src/frontend/pages/settings_permissions/Settings_Permissions.html','src/frontend/pages/settings_departments/Settings_Departments.html','src/frontend/pages/accounting_ledger/Accounting_Ledger.html','src/frontend/pages/accounting_reconciliation/Accounting_Reconciliation.html','src/frontend/pages/accounting_settlement/Accounting_Settlement.html'
  ]);
  const templates = [
    'src/frontend/pages/main/Main.html','src/frontend/pages/mypage/MyPage.html','src/frontend/pages/settings_home/Settings_Home.html','src/frontend/pages/settings_users/Settings_Users.html','src/frontend/pages/settings_roles/Settings_Roles.html','src/frontend/pages/settings_permissions/Settings_Permissions.html','src/frontend/pages/settings_departments/Settings_Departments.html','src/400_accounting/400_home/Accounting_Home.html','src/frontend/pages/accounting_ledger/Accounting_Ledger.html','src/frontend/pages/accounting_reconciliation/Accounting_Reconciliation.html','src/frontend/pages/accounting_settlement/Accounting_Settlement.html','src/500_student_fee/500_home/Student_Fee_Home.html','src/500_student_fee/510_payers/Student_Fee_Payers.html','src/500_student_fee/520_payments/Student_Fee_Payments.html','src/500_student_fee/530_refunds/Student_Fee_Refunds.html','src/600_event/610_home/Event_Home.html','src/600_event/620_form/Event_Form.html','src/600_event/630_detail/Event_Detail.html'
  ];
  templates.forEach(function(relativePath){ const html=fs.readFileSync(path.join(root,relativePath),'utf8'); const expected=migrated.has(relativePath)?"include('frontend/shared/api/app_api_runner_js')":"include('100_common/app_api_runner_js')"; assert.ok(html.indexOf(expected)>=0,relativePath+' must include expected app_api_runner_js path'); });
  console.log('Shared app API runner contract: PASS');
})().catch(function(error){ console.error(error); process.exitCode=1; });
