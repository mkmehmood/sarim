/* Capacitor-compatible bridge for the Flutter host.
 * The Sarim web app talks to native features through window.Capacitor.Plugins.*
 * (see modules/native.js). This shim exposes the same surface and forwards every
 * call to Dart via flutter_inappwebview's "native" handler. */
(function () {
  'use strict';
  if (window.Capacitor && window.Capacitor.__flutter) return;

  var isReady = function () { return !!(window.flutter_inappwebview && window.flutter_inappwebview.callHandler); };
  var whenReady = function () {
    if (isReady()) return Promise.resolve();
    return new Promise(function (resolve) {
      window.addEventListener('flutterInAppWebViewPlatformReady', function () { resolve(); }, { once: true });
    });
  };

  function call(plugin, method, args) {
    return whenReady().then(function () {
      return window.flutter_inappwebview.callHandler('native', plugin, method, args || {});
    }).then(function (res) {
      if (res && res.__error) {
        var err = new Error(res.message || 'Native call failed');
        err.code = res.code;
        throw err;
      }
      return res;
    });
  }

  var listeners = {};
  window.__flutterEmit = function (plugin, event, payload) {
    (listeners[plugin + ':' + event] || []).slice().forEach(function (cb) { try { cb(payload); } catch (e) { console.error(e); } });
  };
  window.__flutterBack = function () {
    var list = (listeners['App:backButton'] || []).slice();
    list.forEach(function (cb) { try { cb({ canGoBack: false }); } catch (e) { console.error(e); } });
    return list.length > 0;
  };

  function makePlugin(name, methods, noop) {
    var p = {};
    (methods || []).forEach(function (m) { p[m] = function (a) { return call(name, m, a); }; });
    (noop || []).forEach(function (m) { p[m] = function () { return Promise.resolve({}); }; });
    p.addListener = function (event, cb) {
      var key = name + ':' + event;
      (listeners[key] = listeners[key] || []).push(cb);
      return Promise.resolve({ remove: function () { listeners[key] = (listeners[key] || []).filter(function (f) { return f !== cb; }); return Promise.resolve(); } });
    };
    p.removeAllListeners = function () {
      Object.keys(listeners).forEach(function (k) { if (k.indexOf(name + ':') === 0) delete listeners[k]; });
      return Promise.resolve();
    };
    return p;
  }

  var Plugins = {
    SaveFile: makePlugin('SaveFile', ['saveToDownloads', 'openFile']),
    DirectShare: (function () {
      var p = makePlugin('DirectShare', ['openChat', 'sendText']);
      // Media straight into a WhatsApp chat needs a native intent; the web app falls back to the system share sheet.
      p.shareToWhatsApp = function () { var e = new Error('Direct sharing is not available'); e.code = 'UNAVAILABLE'; return Promise.reject(e); };
      return p;
    })(),
    Share: makePlugin('Share', ['share']),
    Filesystem: makePlugin('Filesystem', ['writeFile', 'readdir', 'rmdir', 'deleteFile']),
    Haptics: makePlugin('Haptics', ['impact', 'vibrate', 'notification', 'selectionStart', 'selectionChanged', 'selectionEnd']),
    HapticFeedback: makePlugin('HapticFeedback', ['describe', 'perform']),
    NativeBiometric: makePlugin('NativeBiometric', ['isAvailable', 'verifyIdentity']),
    LocalNotifications: makePlugin('LocalNotifications', ['checkPermissions', 'requestPermissions', 'schedule']),
    App: makePlugin('App', ['exitApp', 'openUrl']),
    WindowBackground: makePlugin('WindowBackground', ['set']),
    Keyboard: makePlugin('Keyboard', [], ['hide', 'show']),
    StatusBar: makePlugin('StatusBar', [], ['setStyle', 'setBackgroundColor', 'show', 'hide']),
    SplashScreen: makePlugin('SplashScreen', [], ['hide', 'show'])
    // Geolocation, Camera and PushNotifications are intentionally absent: the web app then uses
    // navigator.geolocation and getUserMedia / <input capture>, which the WebView host grants natively.
  };

  window.Capacitor = {
    __flutter: true,
    isNativePlatform: function () { return true; },
    getPlatform: function () { return 'android'; },
    isPluginAvailable: function (n) { return !!Plugins[n]; },
    registerPlugin: function (n) { return Plugins[n] || makePlugin(n, [], []); },
    Plugins: Plugins
  };
})();
