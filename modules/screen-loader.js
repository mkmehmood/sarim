const defs = new Map();
const pending = new Map();
const mounted = new Set();

export function isLazyScreen(id) { return defs.has(id); }
export function isScreenMounted(id) { return mounted.has(id); }

function mount(id, mod) {
  if (typeof document === 'undefined') return;
  if (mod.__screenCss && mod.__screenCss.trim() && !document.querySelector(`style[data-screen-css="${id}"]`)) {
    const st = document.createElement('style');
    st.setAttribute('data-screen-css', id);
    st.textContent = mod.__screenCss;
    document.head.appendChild(st);
  }
  const holder = document.getElementById(id);
  if (holder && holder.hasAttribute('data-lazy-screen')) {
    const t = document.createElement('template');
    t.innerHTML = mod.__screenHtml;
    holder.replaceWith(t.content);
  }
  if (typeof mod.onMount === 'function') mod.onMount();
}

export function loadScreen(id) {
  if (mounted.has(id)) return Promise.resolve();
  if (!pending.has(id)) {
    const def = defs.get(id);
    if (!def) return Promise.reject(new Error(`Unknown screen: ${id}`));
    pending.set(id, Promise.resolve().then(def.load).then(mod => { mount(id, mod); mounted.add(id); })
      .catch(err => { pending.delete(id); throw err; }));
  }
  return pending.get(id);
}

function reportLoadFailure() {
  if (typeof window.showToast === 'function') window.showToast('Could not load this screen. Check your connection and try again.', 'error', 4000);
}

function installStubs(id, globals) {
  for (const name of globals || []) {
    if (typeof window[name] === 'function') continue;
    const stub = function (...args) {
      return loadScreen(id).catch(err => { reportLoadFailure(); throw err; }).then(() => {
        const real = window[name];
        return real === stub || typeof real !== 'function' ? undefined : real.apply(this, args);
      });
    };
    stub.__screenStub = true;
    window[name] = stub;
  }
}

function installOpenGate() {
  const orig = window.openStandaloneScreen;
  if (typeof orig !== 'function' || orig.__screenGate) return;
  const gate = function (id) {
    if (defs.has(id) && !mounted.has(id)) {
      loadScreen(id).then(() => orig(id)).catch(reportLoadFailure);
      return;
    }
    return orig(id);
  };
  gate.__screenGate = true;
  window.openStandaloneScreen = gate;
}

export function registerScreens(map) {
  for (const [id, def] of Object.entries(map)) {
    defs.set(id, def);
    installStubs(id, def.globals);
  }
  installOpenGate();
}

export const registerLazyModules = registerScreens;
