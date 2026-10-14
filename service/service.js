// Aura Home's registered webOS service. The Homebrew init.d hook starts it as
// root with --boot --watch; an ordinary Luna status request has no side effects.
var Service = require('webos-service');
var fs = require('fs');

var APP_ID = 'tld.my.customhome';
var SERVICE_ID = APP_ID + '.service';
var KEY_CODE_FILE = '/var/lib/webosbrew/aura-home-keycode';
var PID_FILE = '/tmp/aura-home-service.pid';
var LOG_FILE = '/tmp/aura-home-service.log';
var ARGS = process.argv.slice(2);
var BOOT = ARGS.indexOf('--boot') !== -1;
var WATCH = ARGS.indexOf('--watch') !== -1;
var ACTIVE = BOOT || WATCH;
var EVENT_SIZE = process.arch === 'arm64' || process.arch === 'x64' ? 24 : 16;
var EV_KEY = 1;
var devices = {};

function log(message) {
  try { fs.appendFileSync(LOG_FILE, '[' + Date.now() + '] ' + message + '\n'); }
  catch (e) { /* Log failures must not stop the watcher. */ }
}

function homeCode() {
  var raw = process.env.AURA_HOME_KEY_CODE;
  if (!raw) {
    try { raw = fs.readFileSync(KEY_CODE_FILE, 'utf8').trim(); }
    catch (e) { raw = '773'; }
  }
  var code = Number(raw);
  if (!/^\d+$/.test(raw) || code < 1 || code > 1023) {
    log('invalid HOME code ' + JSON.stringify(raw) + '; using 773');
    return 773;
  }
  return code;
}
var HOME_CODE = homeCode();

// webos-service normally idle-exits. The watcher must remain resident.
if (ACTIVE && process.argv.indexOf('--disable-timeouts') === -1) {
  process.argv.push('--disable-timeouts');
}
var service = new Service(SERVICE_ID);
if (ACTIVE) {
  try { fs.writeFileSync(PID_FILE, String(process.pid)); }
  catch (e) { log('cannot write pid: ' + e.message); }
}
log('start pid=' + process.pid + ' args=[' + ARGS.join(' ') +
    '] key=' + HOME_CODE + ' eventSize=' + EVENT_SIZE);

service.register('status', function (message) {
  message.respond({
    returnValue: true,
    running: ACTIVE,
    pid: process.pid,
    watching: WATCH,
    homeCode: HOME_CODE,
    inputDevices: Object.keys(devices).length
  });
});

function launch(reason, done) {
  var finished = false;
  var timeout = setTimeout(function () { finish(false, 'timeout'); }, 3500);
  function finish(ok, detail) {
    if (finished) return;
    finished = true;
    clearTimeout(timeout);
    log('launch ' + reason + ': ' + detail);
    if (done) done(ok);
  }
  try {
    service.call('luna://com.webos.applicationManager/launch', { id: APP_ID }, function (message) {
      var payload = message && message.payload;
      finish(!!(payload && payload.returnValue === true), JSON.stringify(payload));
    });
  } catch (e) { finish(false, e.message); }
}

function bootLaunch(attempt) {
  launch('boot #' + attempt, function (ok) {
    if (!ok && attempt < 30) {
      setTimeout(function () { bootLaunch(attempt + 1); }, 2000);
    }
  });
}

var lastHomeLaunch = -Infinity;
function onHome() {
  var now = Date.now();
  if (now - lastHomeLaunch < 1200) return;
  lastHomeLaunch = now;
  launch('HOME key');
}

// Read all input nodes in nonblocking mode. Async fs.read on each idle device
// would occupy libuv worker threads and can starve the node carrying HOME.
function closeDevice(name) {
  try { fs.closeSync(devices[name]); } catch (e) { /* Device vanished. */ }
  delete devices[name];
}
function scanDevices() {
  var names;
  try {
    names = fs.readdirSync('/dev/input').filter(function (name) {
      return /^event\d+$/.test(name);
    });
  } catch (e) {
    log('input scan: ' + e.message);
    return;
  }
  Object.keys(devices).forEach(function (name) {
    if (names.indexOf(name) === -1) closeDevice(name);
  });
  names.forEach(function (name) {
    if (Object.prototype.hasOwnProperty.call(devices, name)) return;
    try {
      devices[name] = fs.openSync('/dev/input/' + name,
        fs.constants.O_RDONLY | fs.constants.O_NONBLOCK);
    } catch (e) { /* Some input devices are inaccessible. */ }
  });
}
function pollDevices() {
  var buffer = Buffer.alloc(EVENT_SIZE * 32);
  Object.keys(devices).forEach(function (name) {
    var bytes;
    try { bytes = fs.readSync(devices[name], buffer, 0, buffer.length, null); }
    catch (e) {
      if (e.code !== 'EAGAIN' && e.code !== 'EWOULDBLOCK') closeDevice(name);
      return;
    }
    for (var offset = 0; offset + EVENT_SIZE <= bytes; offset += EVENT_SIZE) {
      var type = buffer.readUInt16LE(offset + EVENT_SIZE - 8);
      var code = buffer.readUInt16LE(offset + EVENT_SIZE - 6);
      var value = buffer.readInt32LE(offset + EVENT_SIZE - 4);
      if (type === EV_KEY && code === HOME_CODE && value === 1) onHome();
    }
  });
}

if (WATCH) {
  scanDevices();
  log('watching ' + Object.keys(devices).length + ' input devices');
  setInterval(scanDevices, 5000);
  setInterval(pollDevices, 40);
}
if (BOOT) setTimeout(function () { bootLaunch(1); }, 1000);

// Homebrew's init.d only runs at a cold boot. Timers pause during standby;
// a large heartbeat gap after resume triggers a bounded relaunch sequence.
if (ACTIVE) {
  var lastBeat = Date.now();
  setInterval(function () {
    var now = Date.now();
    var gap = now - lastBeat;
    lastBeat = now;
    if (gap > 10000) {
      log('wake detected after ' + Math.round(gap / 1000) + 's');
      for (var i = 0; i < 4; i++) {
        (function (attempt) {
          setTimeout(function () { launch('wake #' + (attempt + 1)); }, attempt * 1500);
        })(i);
      }
    }
  }, 1000);
}

process.on('SIGTERM', function () {
  Object.keys(devices).forEach(closeDevice);
  try {
    if (fs.readFileSync(PID_FILE, 'utf8').trim() === String(process.pid)) {
      fs.unlinkSync(PID_FILE);
    }
  } catch (e) { /* The pid file may already be gone. */ }
  process.exit(0);
});
