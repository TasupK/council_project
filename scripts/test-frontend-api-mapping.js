const assert = require('assert');
const path = require('path');

const verifier = require('./verify-frontend-api-mapping');

const validFrontend = `
  google.script.run
    .withSuccessHandler(function (response) {})
    .withFailureHandler(function (error) {})
    .api_ping({ id: 'A-1' });
`;
const validServer = `
  function api_ping(request) {
    return { ok: true, data: request };
  }
`;

let result = verifier.auditSourcePair(validFrontend, validServer, {
  frontendPath: 'fixture/frontend.html',
  serverPath: 'fixture/api.gs'
});
assert.deepStrictEqual(result.missingServerApis, []);
assert.deepStrictEqual(result.dynamicCalls, []);

result = verifier.auditSourcePair(
  `google.script.run.withSuccessHandler(done).api_missing({});`,
  validServer,
  { frontendPath: 'fixture/missing.html', serverPath: 'fixture/api.gs' }
);
assert.strictEqual(result.missingServerApis.length, 1);
assert.strictEqual(result.missingServerApis[0].name, 'api_missing');

result = verifier.auditSourcePair(
  `google.script.run[apiName](payload);`,
  validServer,
  { frontendPath: 'fixture/dynamic.html', serverPath: 'fixture/api.gs' }
);
assert.strictEqual(result.dynamicCalls.length, 1);

result = verifier.auditSourcePair(
  `// TODO: google.script.run.api_future({});\n/* api_future_two */\ngoogle.script.run.api_ping({});`,
  validServer,
  { frontendPath: 'fixture/comments.html', serverPath: 'fixture/api.gs' }
);
assert.deepStrictEqual(result.missingServerApis, []);

result = verifier.auditSourcePair(
  `function setVisible(key) { state[key] = true; }\nsetVisible('main');\ngoogle.script.run.api_ping({});`,
  validServer,
  { frontendPath: 'fixture/brackets.html', serverPath: 'fixture/api.gs' }
);
assert.deepStrictEqual(result.dynamicCalls, []);

const repoResult = verifier.auditRepository(path.resolve(__dirname, '..'));
if (repoResult.missingServerApis.length || repoResult.dynamicCalls.length) {
  console.error(verifier.formatAuditFailures(repoResult));
}
assert.deepStrictEqual(repoResult.missingServerApis, []);
assert.deepStrictEqual(repoResult.dynamicCalls, []);

console.log('Frontend API mapping contract: PASS');
