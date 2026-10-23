const P = () => (typeof window !== 'undefined' && window.Capacitor && window.Capacitor.Plugins) || {};

const CODE_REASON = {
  'OS-PLUG-GLOC-0003': 'permission',
  'OS-PLUG-GLOC-0018': 'permission',
  'OS-PLUG-GLOC-0007': 'services-off',
  'OS-PLUG-GLOC-0009': 'services-off',
  'OS-PLUG-GLOC-0016': 'services-off',
  'OS-PLUG-GLOC-0017': 'services-off',
  'OS-PLUG-GLOC-0010': 'timeout',
  'OS-PLUG-GLOC-0014': 'google-services',
  'OS-PLUG-GLOC-0015': 'google-services'
};

const REASON_MESSAGE = {
  permission: 'Location permission denied. Allow Location for this app in the phone settings.',
  'services-off': 'Location is turned off. Turn on Location in the phone settings and try again.',
  timeout: 'Could not get a location in time. Move to open sky and try again.',
  'google-services': 'Google Play services location is not available on this phone.',
  unavailable: 'Weak GPS signal. Go outside.'
};

const W3C_CODE = { permission: 1, timeout: 3 };

export function classifyGeoError(e) {
  const code = String((e && e.code) || '');
  if (CODE_REASON[code]) return CODE_REASON[code];
  const msg = String((e && e.message) || e || '');
  if (/not enabled|turned off|location services|disabled|enable location/i.test(msg)) return 'services-off';
  if (/permission|denied/i.test(msg)) return 'permission';
  if (/timeout|timed out|in time/i.test(msg)) return 'timeout';
  if (/google play services/i.test(msg)) return 'google-services';
  if (e && (e.code === 1 || e.code === 3)) return e.code === 1 ? 'permission' : 'timeout';
  return 'unavailable';
}

export function geoErr(e) {
  const reason = classifyGeoError(e);
  return {
    code: W3C_CODE[reason] || 2,
    reason,
    message: String((e && e.message) || e || '') || REASON_MESSAGE[reason],
    PERMISSION_DENIED: 1,
    POSITION_UNAVAILABLE: 2,
    TIMEOUT: 3
  };
}

export function geoErrorMessage(error) {
  if (!error) return 'Location error.';
  const reason = error.reason || (error.code === 1 ? 'permission' : error.code === 3 ? 'timeout' : error.code === 2 ? 'unavailable' : null);
  return REASON_MESSAGE[reason] || 'Location error.';
}

const toPosition = (p) => ({
  coords: {
    latitude: p.coords.latitude,
    longitude: p.coords.longitude,
    accuracy: p.coords.accuracy,
    altitude: p.coords.altitude,
    altitudeAccuracy: p.coords.altitudeAccuracy,
    heading: p.coords.heading,
    speed: p.coords.speed
  },
  timestamp: p.timestamp || Date.now()
});

const quiet = (fn, arg) => {
  if (typeof fn !== 'function') return;
  try { fn(arg); } catch (e) { try { console.error(e); } catch (_) {} }
};

const swallow = (call) => {
  try { return Promise.resolve(call()).catch(() => {}); } catch (_) { return Promise.resolve(); }
};

export function createGeolocationShim(Geolocation) {
  const watches = new Map();
  let nextId = 1;

  return {
    getCurrentPosition(success, error, opts = {}) {
      let pending;
      try {
        pending = Promise.resolve(Geolocation.getCurrentPosition({
          enableHighAccuracy: opts.enableHighAccuracy !== false,
          timeout: opts.timeout || 20000,
          maximumAge: opts.maximumAge || 0
        }));
      } catch (e) {
        pending = Promise.reject(e);
      }
      pending.then(
        (p) => quiet(success, toPosition(p)),
        (e) => quiet(error, geoErr(e))
      );
    },

    watchPosition(success, error, opts = {}) {
      const id = nextId++;
      const entry = { real: null, cancelled: false };
      watches.set(id, entry);
      const high = opts.enableHighAccuracy !== false;
      let started;
      try {
        started = Geolocation.watchPosition({
          enableHighAccuracy: high,
          timeout: opts.timeout || 30000,
          maximumAge: opts.maximumAge || 0,
          interval: opts.interval || (high ? 2000 : 5000),
          minimumUpdateInterval: 1000
        }, (pos, err) => {
          if (entry.cancelled) return;
          if (err) { quiet(error, geoErr(err)); return; }
          if (pos) quiet(success, toPosition(pos));
        });
      } catch (e) {
        watches.delete(id);
        Promise.resolve().then(() => quiet(error, geoErr(e)));
        return id;
      }
      if (started === null || started === undefined) {
        watches.delete(id);
        Promise.resolve().then(() => quiet(error, geoErr('Location unavailable')));
        return id;
      }
      Promise.resolve(started).then((realId) => {
        if (entry.cancelled) {
          swallow(() => Geolocation.clearWatch({ id: realId }));
          watches.delete(id);
        } else {
          entry.real = realId;
        }
      }, (e) => {
        watches.delete(id);
        quiet(error, geoErr(e));
      });
      return id;
    },

    clearWatch(id) {
      const entry = watches.get(id);
      if (!entry) return;
      entry.cancelled = true;
      if (entry.real !== null) {
        swallow(() => Geolocation.clearWatch({ id: entry.real }));
        watches.delete(id);
      }
    }
  };
}

export function installGeolocationBridge() {
  const { Geolocation } = P();
  if (!Geolocation || typeof navigator === 'undefined') return false;
  try {
    Object.defineProperty(navigator, 'geolocation', { configurable: true, value: createGeolocationShim(Geolocation) });
    return true;
  } catch (_) { return false; }
}

const granted = (st) => !!st && (st.location === 'granted' || st.coarseLocation === 'granted');

export async function requestLocationPermission() {
  const { Geolocation } = P();
  if (!Geolocation) return false;
  try {
    let st = await Geolocation.checkPermissions();
    if (!granted(st)) st = await Geolocation.requestPermissions({ permissions: ['location', 'coarseLocation'] });
    return granted(st);
  } catch (_) { return false; }
}
