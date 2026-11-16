import assert from 'node:assert/strict';
import {test} from 'node:test';

test('room polling gives fetch a bounded request signal', async (t) => {
  const saved = {code: '1234567890ABCDEF', token: 'test-session'};
  const globals = {
    document: {documentElement: {dataset: {}}},
    location: {search: ''},
    sessionStorage: {getItem: () => JSON.stringify(saved)}
  };
  for (const [key, value] of Object.entries(globals)) {
    const previous = Object.getOwnPropertyDescriptor(globalThis, key);
    Object.defineProperty(globalThis, key, {value, configurable: true});
    t.after(() => previous
      ? Object.defineProperty(globalThis, key, previous)
      : Reflect.deleteProperty(globalThis, key));
  }
  const timeout = t.mock.method(AbortSignal, 'timeout', () => new AbortController().signal);
  const fetch = t.mock.method(globalThis, 'fetch', async () => new Response(JSON.stringify({
    code: saved.code, serverNow: Date.now()
  })));
  const online = await import('../dist/online.mjs');
  await new Promise(resolve => online.watch(true, resolve));
  assert.equal(timeout.mock.callCount(), 1);
  assert.equal(timeout.mock.calls[0].arguments[0], 8000);
  assert.equal(fetch.mock.calls[0].arguments[1].signal, timeout.mock.calls[0].result);

  let probes=0, waits=0, notices=0;
  await online.waitForServer({
    probe:async()=>{
      probes++;
      if(probes===1)throw new Error('timeout');
      return new Response(null,{status:probes===2?503:204});
    },
    pause:async(ms)=>{assert.equal(ms,2000);waits++;},
    onWait:()=>notices++
  });
  assert.deepEqual([probes,waits,notices],[3,2,1]);
});
