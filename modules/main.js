import './add-entity.js';
import './raw-material.js';
import './native.js';
import './screen-registry.js';
import './biometric-toggle.js';
import './notify.js';
import './constants.js';
import './business.js';
import './sync.js';
import './approvals.js';
import './utilities-core.js';
import './utilities-sales.js';
import './prod-photos.js';
import './utilities-payments.js';
import './customers.js';
import './money-out.js';
import './formula-store.js';
import './batch-common.js';
import './batch-saved.js';
let _factoryLoad = null;
let _repLoad = null;

window._lazyLoadFactory = function (cb) {
  if (!_factoryLoad) _factoryLoad = import('./factory.js');
  _factoryLoad.then(() => cb && cb()).catch(() => cb && cb());
};

window._lazyLoadRep = function (cb) {
  if (!_repLoad) _repLoad = import('./rep-sales.js');
  _repLoad.then(() => cb && cb()).catch(() => cb && cb());
};

import './custom-date-picker.js';
import './dropdown.js';
import './notify-open.js';
import './phone-actions.js';
import './field-expenses.js';
import './settings-screen.js';
import './desktop-startup.js';
import './push.js';
