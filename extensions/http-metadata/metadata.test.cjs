const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
test('extension sends only origin metadata and bounds pending requests', async () => {
  const hooks = {}, sent = [];
  const event = name => ({addListener: fn => hooks[name] = fn});
  const chrome = {storage: {local: {get: async () => ({enabled: true, key: 'application-pairing-key', browser: 'chrome'})}, onChanged: event('changed')},
    action: {onClicked: event('clicked')}, runtime: {openOptionsPage() {}},
    webRequest: {onBeforeRequest: event('before'), onCompleted: event('complete'), onErrorOccurred: event('error')}};
  const context = vm.createContext({chrome, URL, AbortSignal, fetch: async (url, request) => { sent.push({url, request}); }});
  vm.runInContext(fs.readFileSync(__dirname+'/background.js', 'utf8'), context);
  await new Promise(resolve => setImmediate(resolve));
  hooks.before({requestId: 'safe', url: 'https://example.test/private/path?token=secret#session', method: 'GET', timeStamp: 10});
  hooks.complete({requestId: 'safe', statusCode: 200, timeStamp: 20, responseHeaders: [{name: 'Set-Cookie', value: 'never-read'}]});
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(sent.length, 1);
  const payload = JSON.parse(sent[0].request.body);
  assert.equal(payload.safe_url, 'https://example.test');
  assert.equal(payload.duration_ms, 10);
  assert.equal(payload.profile_id, null);
  assert(!sent[0].request.body.includes('secret'));
  assert(!sent[0].request.body.includes('never-read'));
  for(let n=0;n<600;n++) hooks.before({requestId: 'bounded-'+n,url:'https://example.test/x', method:'GET',timeStamp:0});
  assert(vm.runInContext('pending.size',context)<=512);
  hooks.before({requestId: 'local',url:'http://127.0.0.1:18444/v1/http-events',method:'POST',timeStamp:0});
  hooks.complete({requestId:'local',statusCode:204,timeStamp:10});
  assert.equal(sent.length,1);
  hooks.changed({enabled:{newValue:false}});
  assert.equal(vm.runInContext('pending.size',context),0);
});
