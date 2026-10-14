const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../service/service.js'), 'utf8');

function harness({args = [], arch = 'arm', responses = [], keyCode} = {}) {
  let now = 1000;
  let nextTimer = 1;
  let nextFd = 10;
  const timers = new Map();
  const calls = [];
  const openPaths = new Map();
  const queues = new Map();
  const logs = [];
  let deviceNames = ['event0'];
  const events = {};

  function schedule(callback, delay, interval) {
    const id = nextTimer++;
    timers.set(id, {callback, at: now + delay, interval});
    return id;
  }
  function run(ms) {
    const until = now + ms;
    while (true) {
      let next = null;
      for (const [id, timer] of timers) {
        if (timer.at <= until && (!next || timer.at < next.timer.at)) next = {id, timer};
      }
      if (!next) break;
      now = next.timer.at;
      if (next.timer.interval === null) timers.delete(next.id);
      else next.timer.at += next.timer.interval;
      next.timer.callback();
    }
    now = until;
  }
  function resume(ms) {
    now += ms;
    const due = [...timers].filter(([, timer]) => timer.at <= now);
    for (const [id, timer] of due) {
      if (timer.interval === null) timers.delete(id);
      else timer.at = now + timer.interval;
      timer.callback();
    }
    run(0);
  }

  function Service(name) {
    assert.equal(name, 'tld.my.customhome.service');
    this.register = (method, callback) => { events[method] = callback; };
    this.call = (uri, params, callback) => {
      calls.push({uri, params});
      callback({payload: responses.shift() ?? {returnValue: true}});
    };
  }
  const fakeFs = {
    constants: {O_RDONLY: 0, O_NONBLOCK: 2048},
    appendFileSync: (_name, text) => logs.push(text),
    writeFileSync: () => {},
    readFileSync: (name) => {
      if (name === '/var/lib/webosbrew/aura-home-keycode' && keyCode) return String(keyCode);
      throw Object.assign(new Error('missing'), {code: 'ENOENT'});
    },
    readdirSync: () => deviceNames,
    openSync: (name, flags) => {
      assert.equal(flags, 2048);
      const fd = nextFd++;
      openPaths.set(fd, name);
      return fd;
    },
    readSync: (fd, target, offset) => {
      const pathName = openPaths.get(fd);
      const queue = queues.get(pathName) || [];
      if (!queue.length) throw Object.assign(new Error('idle'), {code: 'EAGAIN'});
      const bytes = queue.shift();
      bytes.copy(target, offset);
      return bytes.length;
    },
    closeSync: (fd) => openPaths.delete(fd),
    unlinkSync: () => {}
  };
  const fakeProcess = {
    argv: ['node', 'service.js', ...args],
    arch,
    pid: 456,
    env: {},
    on: () => {},
    exit: () => { throw new Error('unexpected exit'); }
  };
  vm.runInNewContext(source, {
    require: (id) => id === 'webos-service' ? Service : fakeFs,
    process: fakeProcess,
    Buffer,
    Date: {now: () => now},
    setTimeout: (callback, delay) => schedule(callback, delay, null),
    setInterval: (callback, delay) => schedule(callback, delay, delay),
    clearTimeout: (id) => timers.delete(id)
  });
  return {
    run,
    resume,
    calls,
    logs,
    events,
    setDevices: (names) => { deviceNames = names; },
    queueKey: (device, code, size = arch === 'arm' ? 16 : 24, value = 1) => {
      const bytes = Buffer.alloc(size);
      bytes.writeUInt16LE(1, size - 8);
      bytes.writeUInt16LE(code, size - 6);
      bytes.writeInt32LE(value, size - 4);
      const name = '/dev/input/' + device;
      queues.set(name, [...(queues.get(name) || []), bytes]);
    }
  };
}

test('cold boot retries until applicationManager accepts launch', () => {
  const h = harness({args: ['--boot'], responses: [
    {returnValue: false}, {returnValue: false}, {returnValue: true}
  ]});
  h.run(5000);
  assert.equal(h.calls.length, 3);
  assert.ok(h.calls.every(({uri, params}) =>
    uri === 'luna://com.webos.applicationManager/launch' &&
    params.id === 'tld.my.customhome'));
});

test('HOME polling ignores other keys, debounces repeats, and finds new devices', () => {
  const h = harness({args: ['--watch']});
  h.queueKey('event0', 42);
  h.run(40);
  assert.equal(h.calls.length, 0);
  h.queueKey('event0', 773);
  h.run(40);
  assert.equal(h.calls.length, 1);
  h.queueKey('event0', 773);
  h.run(40);
  assert.equal(h.calls.length, 1);
  h.setDevices(['event1']);
  h.run(5000);
  h.queueKey('event1', 773);
  h.run(40);
  assert.equal(h.calls.length, 2);
});

test('64-bit input records and a configured HOME key code work', () => {
  const h = harness({args: ['--watch'], arch: 'arm64', keyCode: '777'});
  h.queueKey('event0', 777, 24);
  h.run(40);
  assert.equal(h.calls.length, 1);
  let status;
  h.events.status({respond: (value) => { status = value; }});
  assert.equal(status.homeCode, 777);
  assert.equal(status.inputDevices, 1);
});

test('standby heartbeat relaunches four times after a long pause', () => {
  const h = harness({args: ['--watch']});
  h.resume(30000);
  h.run(4500);
  assert.equal(h.calls.length, 4);
  assert.ok(h.logs.some((line) => line.includes('wake detected')));
});
