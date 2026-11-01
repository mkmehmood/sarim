import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  classifyGeoError, geoErr, geoErrorMessage, createGeolocationShim, installGeolocationBridge, requestLocationPermission
} from '../modules/geolocation-bridge.js';

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const fix = (lat = 32.99, lon = 70.6, accuracy = 12) => ({ coords: { latitude: lat, longitude: lon, accuracy, altitude: null, altitudeAccuracy: null, heading: null, speed: null }, timestamp: 1700000000000 });
const pluginError = (code, message) => Object.assign(new Error(message), { code });
const E = {
  denied: pluginError('OS-PLUG-GLOC-0003', 'Location permission request was denied.'),
  off: pluginError('OS-PLUG-GLOC-0007', 'Location services are not enabled.'),
  enableDenied: pluginError('OS-PLUG-GLOC-0009', 'Request to enable location was denied.'),
  timeout: pluginError('OS-PLUG-GLOC-0010', 'Could not obtain location in time. Try with a higher timeout.'),
  google: pluginError('OS-PLUG-GLOC-0015', 'Google Play Services error.'),
  nets: pluginError('OS-PLUG-GLOC-0017', 'Unable to retrieve location because device has both Network and Location turned off.'),
  other: pluginError('OS-PLUG-GLOC-0002', 'There was en error trying to obtain the location.')
};

const makeLegacyPlugin = () => {
  const p = { calls: [], cleared: [], watchCallbacks: {}, nextId: 0, clearFails: false };
  p.getCurrentPosition = (o) => { p.calls.push(['get', o]); return p.getResult ? p.getResult() : Promise.resolve(fix()); };
  p.watchPosition = (o, cb) => { const id = String(++p.nextId); p.calls.push(['watch', o]); p.watchCallbacks[id] = cb; return id; };
  p.clearWatch = (o) => { p.cleared.push(o.id); return p.clearFails ? Promise.reject(pluginError('OS-PLUG-GLOC-0012', 'WatchId not found.')) : Promise.resolve(); };
  return p;
};
const makePromisePlugin = () => {
  const p = makeLegacyPlugin();
  const legacyWatch = p.watchPosition;
  p.watchPosition = (o, cb) => { const id = legacyWatch(o, cb); return new Promise((r) => setTimeout(() => r(id), 15)); };
  return p;
};

describe('classifyGeoError and geoErr', () => {
  it('maps every plugin error code to a clear reason', () => {
    assert.equal(classifyGeoError(E.denied), 'permission');
    assert.equal(classifyGeoError(E.off), 'services-off');
    assert.equal(classifyGeoError(E.enableDenied), 'services-off');
    assert.equal(classifyGeoError(E.nets), 'services-off');
    assert.equal(classifyGeoError(E.timeout), 'timeout');
    assert.equal(classifyGeoError(E.google), 'google-services');
    assert.equal(classifyGeoError(E.other), 'unavailable');
  });
  it('a denied request to enable location is not mistaken for a permission denial', () => {
    assert.equal(geoErr(E.enableDenied).reason, 'services-off');
    assert.equal(geoErr(E.enableDenied).code, 2);
  });
  it('uses the standard 1, 2, 3 codes callers already switch on', () => {
    assert.equal(geoErr(E.denied).code, 1);
    assert.equal(geoErr(E.off).code, 2);
    assert.equal(geoErr(E.timeout).code, 3);
    const e = geoErr(E.denied);
    assert.deepEqual([e.PERMISSION_DENIED, e.POSITION_UNAVAILABLE, e.TIMEOUT], [1, 2, 3]);
  });
  it('falls back to the message when there is no code', () => {
    assert.equal(classifyGeoError(new Error('Location services are not enabled.')), 'services-off');
    assert.equal(classifyGeoError('Location permission denied'), 'permission');
    assert.equal(classifyGeoError(new Error('Timeout expired')), 'timeout');
    assert.equal(classifyGeoError(new Error('Google Play services is missing')), 'google-services');
    assert.equal(classifyGeoError(new Error('boom')), 'unavailable');
    assert.equal(classifyGeoError(null), 'unavailable');
  });
  it('understands real browser position errors', () => {
    assert.equal(classifyGeoError({ code: 1, message: 'User denied Geolocation' }), 'permission');
    assert.equal(classifyGeoError({ code: 2, message: 'Position update is unavailable' }), 'unavailable');
    assert.equal(classifyGeoError({ code: 3, message: 'Timeout expired' }), 'timeout');
  });
});

describe('geoErrorMessage tells the person what to do', () => {
  it('has a distinct message for each reason', () => {
    assert.match(geoErrorMessage(geoErr(E.denied)), /permission denied.*settings/i);
    assert.match(geoErrorMessage(geoErr(E.off)), /Location is turned off.*Turn on Location/);
    assert.match(geoErrorMessage(geoErr(E.timeout)), /in time/);
    assert.match(geoErrorMessage(geoErr(E.google)), /Google Play services/);
    assert.match(geoErrorMessage(geoErr(E.other)), /Weak GPS signal/);
  });
  it('a switched-off location is never reported as a weak GPS signal', () => {
    assert.doesNotMatch(geoErrorMessage(geoErr(E.off)), /Weak GPS/);
    assert.doesNotMatch(geoErrorMessage(geoErr(E.nets)), /Weak GPS/);
  });
  it('still understands plain browser codes with no reason', () => {
    assert.match(geoErrorMessage({ code: 1 }), /permission denied/i);
    assert.match(geoErrorMessage({ code: 2 }), /Weak GPS/);
    assert.match(geoErrorMessage({ code: 3 }), /in time/);
    assert.equal(geoErrorMessage(null), 'Location error.');
    assert.equal(geoErrorMessage({}), 'Location error.');
  });
});

describe('getCurrentPosition', () => {
  let plugin; let shim;
  beforeEach(() => { plugin = makeLegacyPlugin(); shim = createGeolocationShim(plugin); });
  it('returns a standard position', async () => {
    let got = null;
    shim.getCurrentPosition((p) => { got = p; }, () => assert.fail('no error expected'));
    await wait(5);
    assert.deepEqual(got.coords, { latitude: 32.99, longitude: 70.6, accuracy: 12, altitude: null, altitudeAccuracy: null, heading: null, speed: null });
    assert.equal(got.timestamp, 1700000000000);
  });
  it('asks for high accuracy and no cached fix by default', async () => {
    shim.getCurrentPosition(() => {}, () => {});
    await wait(5);
    assert.deepEqual(plugin.calls[0], ['get', { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 }]);
  });
  it('passes the caller options through', async () => {
    shim.getCurrentPosition(() => {}, () => {}, { enableHighAccuracy: false, timeout: 10000, maximumAge: 5000 });
    await wait(5);
    assert.deepEqual(plugin.calls[0][1], { enableHighAccuracy: false, timeout: 10000, maximumAge: 5000 });
  });
  it('reports a switched-off location as such, not as a permission problem', async () => {
    plugin.getResult = () => Promise.reject(E.off);
    let err = null;
    shim.getCurrentPosition(() => assert.fail('no fix expected'), (e) => { err = e; });
    await wait(5);
    assert.equal(err.reason, 'services-off');
    assert.equal(err.code, 2);
  });
  it('reports a denied permission and a timeout with the standard codes', async () => {
    const seen = [];
    plugin.getResult = () => Promise.reject(E.denied);
    shim.getCurrentPosition(() => {}, (e) => seen.push(e.code));
    plugin.getResult = () => Promise.reject(E.timeout);
    shim.getCurrentPosition(() => {}, (e) => seen.push(e.code));
    await wait(5);
    assert.deepEqual(seen.sort(), [1, 3]);
  });
  it('a synchronous failure still reaches the error callback', async () => {
    plugin.getCurrentPosition = () => { throw new Error('bridge down'); };
    let err = null;
    shim.getCurrentPosition(() => {}, (e) => { err = e; });
    await wait(5);
    assert.equal(err.code, 2);
  });
  it('a throwing success handler does not trigger the error handler', async () => {
    let errors = 0;
    const log = console.error; console.error = () => {};
    shim.getCurrentPosition(() => { throw new Error('app bug'); }, () => { errors += 1; });
    await wait(5);
    console.error = log;
    assert.equal(errors, 0);
  });
  it('works without an error callback', async () => {
    plugin.getResult = () => Promise.reject(E.off);
    assert.doesNotThrow(() => shim.getCurrentPosition(() => {}));
    await wait(5);
  });
});

for (const [label, make] of [['Android bridge (id returned as a string)', makeLegacyPlugin], ['package wrapper (id returned as a Promise)', makePromisePlugin]]) {
  describe(`watchPosition with the ${label}`, () => {
    let plugin; let shim;
    beforeEach(() => { plugin = make(); shim = createGeolocationShim(plugin); });

    it('returns a numeric id immediately and starts the native watch', () => {
      const id = shim.watchPosition(() => {}, () => {});
      assert.equal(typeof id, 'number');
      assert.equal(plugin.calls[0][0], 'watch');
    });
    it('does not report an error just because the watch started', async () => {
      let errors = 0;
      shim.watchPosition(() => {}, () => { errors += 1; });
      await wait(40);
      assert.equal(errors, 0);
    });
    it('delivers positions as they arrive', async () => {
      const got = [];
      shim.watchPosition((p) => got.push(p.coords.accuracy), () => assert.fail('no error expected'));
      plugin.watchCallbacks['1'](fix(1, 1, 80));
      plugin.watchCallbacks['1'](fix(1, 1, 30));
      await wait(40);
      assert.deepEqual(got, [80, 30]);
    });
    it('asks for frequent updates instead of using the long timeout as the interval', () => {
      shim.watchPosition(() => {}, () => {}, { enableHighAccuracy: true, timeout: 30000, maximumAge: 0 });
      assert.deepEqual(plugin.calls[0][1], { enableHighAccuracy: true, timeout: 30000, maximumAge: 0, interval: 2000, minimumUpdateInterval: 1000 });
    });
    it('uses a gentler interval when high accuracy is off, and honors an explicit one', () => {
      shim.watchPosition(() => {}, () => {}, { enableHighAccuracy: false });
      shim.watchPosition(() => {}, () => {}, { interval: 7000 });
      assert.equal(plugin.calls[0][1].interval, 5000);
      assert.equal(plugin.calls[1][1].interval, 7000);
    });
    it('forwards native errors with a clear reason', async () => {
      const errs = [];
      shim.watchPosition(() => {}, (e) => errs.push(e.reason));
      plugin.watchCallbacks['1'](null, E.off);
      await wait(40);
      assert.deepEqual(errs, ['services-off']);
    });
    it('stops the native watch when cleared', async () => {
      const id = shim.watchPosition(() => {}, () => {});
      await wait(40);
      shim.clearWatch(id);
      await wait(5);
      assert.deepEqual(plugin.cleared, ['1']);
    });
    it('a watch cleared before the native id is known is still stopped', async () => {
      const id = shim.watchPosition(() => {}, () => {});
      shim.clearWatch(id);
      await wait(60);
      assert.deepEqual(plugin.cleared, ['1']);
    });
    it('no more positions are delivered after clearing', async () => {
      const got = [];
      const id = shim.watchPosition((p) => got.push(p), () => {});
      await wait(40);
      shim.clearWatch(id);
      plugin.watchCallbacks['1'](fix());
      assert.equal(got.length, 0);
    });
    it('a watch that failed can still be cleared natively', async () => {
      const id = shim.watchPosition(() => {}, () => {});
      await wait(40);
      plugin.watchCallbacks['1'](null, E.timeout);
      shim.clearWatch(id);
      await wait(5);
      assert.deepEqual(plugin.cleared, ['1']);
    });
    it('clearing twice or clearing an unknown id is harmless', async () => {
      const id = shim.watchPosition(() => {}, () => {});
      await wait(40);
      shim.clearWatch(id);
      shim.clearWatch(id);
      shim.clearWatch(999);
      await wait(5);
      assert.deepEqual(plugin.cleared, ['1']);
    });
    it('a native clear failure is swallowed', async () => {
      plugin.clearFails = true;
      const id = shim.watchPosition(() => {}, () => {});
      await wait(40);
      assert.doesNotThrow(() => shim.clearWatch(id));
      await wait(5);
    });
    it('keeps several watches independent', async () => {
      const a = shim.watchPosition(() => {}, () => {});
      const b = shim.watchPosition(() => {}, () => {});
      await wait(40);
      assert.notEqual(a, b);
      shim.clearWatch(a);
      await wait(5);
      assert.deepEqual(plugin.cleared, ['1']);
      shim.clearWatch(b);
      await wait(5);
      assert.deepEqual(plugin.cleared, ['1', '2']);
    });
  });
}

describe('watchPosition start failures', () => {
  it('a watch that cannot start reports an error and still returns an id', async () => {
    const plugin = makeLegacyPlugin();
    plugin.watchPosition = () => { throw new Error('bridge down'); };
    const shim = createGeolocationShim(plugin);
    let err = null;
    const id = shim.watchPosition(() => {}, (e) => { err = e; });
    assert.equal(typeof id, 'number');
    await wait(5);
    assert.equal(err.code, 2);
    assert.doesNotThrow(() => shim.clearWatch(id));
  });
  it('a null id from the bridge is reported as unavailable', async () => {
    const plugin = makeLegacyPlugin();
    plugin.watchPosition = () => null;
    const shim = createGeolocationShim(plugin);
    let err = null;
    shim.watchPosition(() => {}, (e) => { err = e; });
    await wait(5);
    assert.equal(err.reason, 'unavailable');
  });
  it('a rejected start is reported', async () => {
    const plugin = makeLegacyPlugin();
    plugin.watchPosition = () => Promise.reject(E.denied);
    const shim = createGeolocationShim(plugin);
    let err = null;
    shim.watchPosition(() => {}, (e) => { err = e; });
    await wait(5);
    assert.equal(err.code, 1);
  });
  it('a throwing success handler does not break the watch', async () => {
    const plugin = makeLegacyPlugin();
    const shim = createGeolocationShim(plugin);
    const log = console.error; console.error = () => {};
    shim.watchPosition(() => { throw new Error('app bug'); }, () => {});
    await wait(5);
    assert.doesNotThrow(() => plugin.watchCallbacks['1'](fix()));
    console.error = log;
  });
});

describe('installGeolocationBridge and permission request', () => {
  const setNav = () => { Object.defineProperty(globalThis, 'navigator', { value: {}, configurable: true }); };
  it('replaces navigator.geolocation when the native plugin exists', () => {
    setNav();
    globalThis.window = { Capacitor: { Plugins: { Geolocation: makeLegacyPlugin() } } };
    assert.equal(installGeolocationBridge(), true);
    assert.equal(typeof navigator.geolocation.watchPosition, 'function');
    assert.equal(typeof navigator.geolocation.clearWatch, 'function');
  });
  it('leaves the browser alone when there is no native plugin', () => {
    setNav();
    globalThis.window = { Capacitor: { Plugins: {} } };
    assert.equal(installGeolocationBridge(), false);
    assert.equal(navigator.geolocation, undefined);
  });
  it('does not ask again when permission is already granted', async () => {
    const calls = [];
    globalThis.window = { Capacitor: { Plugins: { Geolocation: { checkPermissions: async () => ({ location: 'granted' }), requestPermissions: async () => { calls.push('request'); return {}; } } } } };
    assert.equal(await requestLocationPermission(), true);
    assert.deepEqual(calls, []);
  });
  it('asks for precise and approximate location when not yet granted', async () => {
    let asked = null;
    globalThis.window = { Capacitor: { Plugins: { Geolocation: { checkPermissions: async () => ({ location: 'prompt', coarseLocation: 'prompt' }), requestPermissions: async (o) => { asked = o; return { location: 'denied', coarseLocation: 'granted' }; } } } } };
    assert.equal(await requestLocationPermission(), true);
    assert.deepEqual(asked, { permissions: ['location', 'coarseLocation'] });
  });
  it('is false when denied, when location is switched off, or when the plugin is missing', async () => {
    globalThis.window = { Capacitor: { Plugins: { Geolocation: { checkPermissions: async () => ({ location: 'prompt' }), requestPermissions: async () => ({ location: 'denied', coarseLocation: 'denied' }) } } } };
    assert.equal(await requestLocationPermission(), false);
    globalThis.window = { Capacitor: { Plugins: { Geolocation: { checkPermissions: async () => { throw E.off; } } } } };
    assert.equal(await requestLocationPermission(), false);
    globalThis.window = { Capacitor: { Plugins: {} } };
    assert.equal(await requestLocationPermission(), false);
  });
});
