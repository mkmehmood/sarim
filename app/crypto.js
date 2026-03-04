const CryptoEngine = (() => {
const MAGIC = new Uint8Array([0x47,0x5A,0x4E,0x44,0x5F,0x45,0x4E,0x43,0x5F,0x56,0x32]);
const SALT_LEN = 32;
const IV_LEN = 12;
const PBKDF2_ITERS = 310000;
async function deriveKey(email, password, salt) {
const enc = new TextEncoder();
const keyMaterial = await crypto.subtle.importKey(
'raw',
enc.encode(email.toLowerCase().trim() + ':' + password),
'PBKDF2',
false,
['deriveKey']
);
return crypto.subtle.deriveKey(
{ name: 'PBKDF2', salt: salt, iterations: PBKDF2_ITERS, hash: 'SHA-256' },
keyMaterial,
{ name: 'AES-GCM', length: 256 },
false,
['encrypt', 'decrypt']
);
}
async function deriveKeyHash(email, password) {
const enc = new TextEncoder();
const keyMaterial = await crypto.subtle.importKey(
'raw', enc.encode(email.toLowerCase().trim() + ':' + password),
'PBKDF2', false, ['deriveKey']
);
const fixedSalt = enc.encode('GZND_LOCAL_AUTH_SALT_v2_' + email.toLowerCase().trim());
const key = await crypto.subtle.deriveKey(
{ name: 'PBKDF2', salt: fixedSalt, iterations: PBKDF2_ITERS, hash: 'SHA-256' },
keyMaterial, { name: 'AES-GCM', length: 256 }, true, ['encrypt']
);
const raw = await crypto.subtle.exportKey('raw', key);
const hashBuf = await crypto.subtle.digest('SHA-256', raw);
return Array.from(new Uint8Array(hashBuf)).map(b => b.toString(16).padStart(2,'0')).join('');
}
return {
async encrypt(dataObj, email, password) {
const salt = crypto.getRandomValues(new Uint8Array(SALT_LEN));
const iv = crypto.getRandomValues(new Uint8Array(IV_LEN));
const key = await deriveKey(email, password, salt);
const plaintext = new TextEncoder().encode(JSON.stringify(dataObj));
const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plaintext);
const ctBytes = new Uint8Array(ciphertext);
const out = new Uint8Array(MAGIC.length + SALT_LEN + IV_LEN + ctBytes.length);
let offset = 0;
out.set(MAGIC, offset); offset += MAGIC.length;
out.set(salt, offset); offset += SALT_LEN;
out.set(iv, offset); offset += IV_LEN;
out.set(ctBytes, offset);
return new Blob([out], { type: 'application/octet-stream' });
},
async decrypt(arrayBuffer, email, password) {
const bytes = new Uint8Array(arrayBuffer);
const magic = bytes.slice(0, MAGIC.length);
for (let i = 0; i < MAGIC.length; i++) {
if (magic[i] !== MAGIC[i]) throw new Error('INVALID_FORMAT');
}
let offset = MAGIC.length;
const salt = bytes.slice(offset, offset + SALT_LEN); offset += SALT_LEN;
const iv = bytes.slice(offset, offset + IV_LEN); offset += IV_LEN;
const ciphertext = bytes.slice(offset);
const key = await deriveKey(email, password, salt);
let plaintext;
try {
plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext);
} catch(e) {
throw new Error('WRONG_CREDENTIALS');
}
return JSON.parse(new TextDecoder().decode(plaintext));
},
async hashCredentials(email, password) {
return deriveKeyHash(email, password);
}
};
})();
const OfflineAuth = {
IDB_NAME: 'GZND_AuthDB',
STORE: 'credentials',
async _getDB() {
return new Promise((res, rej) => {
const req = indexedDB.open(this.IDB_NAME, 1);
req.onupgradeneeded = e => {
e.target.result.createObjectStore(this.STORE);
};
req.onsuccess = e => res(e.target.result);
req.onerror = e => rej(e.target.error);
});
},
async saveCredentials(email, password) {
const hash = await CryptoEngine.hashCredentials(email, password);
const db = await this._getDB();
return new Promise((res, rej) => {
const tx = db.transaction(this.STORE, 'readwrite');
tx.objectStore(this.STORE).put({ hash, email, savedAt: Date.now() }, 'active');
tx.oncomplete = () => res(true);
tx.onerror = e => rej(e.target.error);
});
},
async verifyCredentials(email, password) {
const db = await this._getDB();
const record = await new Promise((res, rej) => {
const tx = db.transaction(this.STORE, 'readonly');
const req = tx.objectStore(this.STORE).get('active');
req.onsuccess = e => res(e.target.result);
req.onerror = e => rej(e.target.error);
});
if (!record) return false;
if (record.email.toLowerCase().trim() !== email.toLowerCase().trim()) return false;
const hash = await CryptoEngine.hashCredentials(email, password);
return hash === record.hash;
},
async getSavedEmail() {
const db = await this._getDB();
const record = await new Promise((res, rej) => {
const tx = db.transaction(this.STORE, 'readonly');
const req = tx.objectStore(this.STORE).get('active');
req.onsuccess = e => res(e.target.result);
req.onerror = () => res(null);
});
return record ? record.email : null;
},
async hasStoredCredentials() {
const email = await this.getSavedEmail();
return !!email;
},
async clearCredentials() {
const db = await this._getDB();
return new Promise((res, rej) => {
const tx = db.transaction(this.STORE, 'readwrite');
tx.objectStore(this.STORE).delete('active');
tx.oncomplete = () => res(true);
tx.onerror = e => rej(e.target.error);
});
}
};
let currentUser = null;
let firebaseDB = null;
let database = null;
let auth = null;
let isSyncing = false;
async function _checkFirebaseSessionExists() {
try {
if ('databases' in indexedDB) {
const dbs = await indexedDB.databases();
const hasFirebaseDB = dbs.some(d =>
d.name && (d.name.includes('firebaseLocalStorage') || d.name.includes('firebase'))
);
if (hasFirebaseDB) {
const tokenExists = await _readFirebaseTokenFromIDB();
if (tokenExists) return true;
}
}
const sessionFlag = sessionStorage.getItem('_gznd_session_active');
if (sessionFlag === '1') return true;
return false;
} catch(e) {
return false;
}
}
async function _readFirebaseTokenFromIDB() {
try {
const dbs = await indexedDB.databases();
const firebaseDB_name = dbs.find(d => d.name && d.name.includes('firebaseLocalStorage'));
if (!firebaseDB_name) return false;
return new Promise((resolve) => {
const req = indexedDB.open(firebaseDB_name.name);
req.onsuccess = (e) => {
const db = e.target.result;
const stores = Array.from(db.objectStoreNames);
if (stores.length === 0) { db.close(); resolve(false); return; }
try {
const tx = db.transaction(stores[0], 'readonly');
const store = tx.objectStore(stores[0]);
const getAllReq = store.getAll();
getAllReq.onsuccess = () => {
db.close();
const results = getAllReq.result || [];
const hasUser = results.some(r => r && r.value && (r.value.uid || r.value.email));
resolve(hasUser);
};
getAllReq.onerror = () => { db.close(); resolve(false); };
} catch(txErr) { db.close(); resolve(false); }
};
req.onerror = () => resolve(false);
});
} catch(e) { return false; }
}

const IDBCrypto = (() => {

  let _sessionKey = null;
  let _keyEmail = null;
  let _db = null;
  let _initPromise = null;

  const PBKDF2_ITERS = 310000;

  
  const DB_NAME = 'GZND_SecureStorage';
  const DB_VERSION = 1;
  const KEY_STORE = 'encryptedKeys';
  const ENTROPY_STORE = 'deviceEntropy';
  const IDB_KDF_SALT = new Uint8Array([
    0x47,0x5A,0x4E,0x44,0x49,0x44,0x42,0x4B,
    0x45,0x59,0x53,0x41,0x4C,0x54,0x76,0x31,
    0x32,0x30,0x32,0x34,0x41,0x45,0x53,0x32,
    0x35,0x36,0x47,0x43,0x4D,0x45,0x4E,0x43
  ]);
  const IV_LEN = 12;
  const ENC_PREFIX = 'GZND_ENC_';
  const KEY_VERSION = '3'; 

  
  const LEGACY_LS_KEY = '_gznd_idbk_v2';
  const LEGACY_LS_SECRET = '_gznd_wksec_v2';
  const LEGACY_LS_EMAIL = '_gznd_key_email';

  async function _initDB() {
    if (_db) return _db;
    if (_initPromise) return _initPromise;

    _initPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => {
        _initPromise = null;
        reject(request.error);
      };

      request.onsuccess = () => {
        _db = request.result;
        resolve(_db);
      };

      request.onupgradeneeded = (event) => {
        const db = event.target.result;

        
        if (!db.objectStoreNames.contains(KEY_STORE)) {
          const keyStore = db.createObjectStore(KEY_STORE, { keyPath: 'id' });
          keyStore.createIndex('email', 'email', { unique: false });
          keyStore.createIndex('version', 'version', { unique: false });
        }

        
        if (!db.objectStoreNames.contains(ENTROPY_STORE)) {
          db.createObjectStore(ENTROPY_STORE, { keyPath: 'id' });
        }
      };
    });

    return _initPromise;
  }

  async function _getDeviceEntropy() {
    const db = await _initDB();

    return new Promise((resolve, reject) => {
      const tx = db.transaction(ENTROPY_STORE, 'readonly');
      const store = tx.objectStore(ENTROPY_STORE);
      const request = store.get('primary');

      request.onsuccess = async () => {
        if (request.result) {

          const entropyHex = request.result.entropy;
          const entropy = new Uint8Array(entropyHex.match(/.{2}/g).map(h => parseInt(h, 16)));
          resolve(entropy);
        } else {

          const newEntropy = crypto.getRandomValues(new Uint8Array(32));
          const entropyHex = Array.from(newEntropy).map(b => b.toString(16).padStart(2, '0')).join('');

          try {
            const writeTx = db.transaction(ENTROPY_STORE, 'readwrite');
            const writeStore = writeTx.objectStore(ENTROPY_STORE);
            await new Promise((res, rej) => {
              const writeReq = writeStore.put({ id: 'primary', entropy: entropyHex });
              writeReq.onsuccess = () => res();
              writeReq.onerror = () => rej(writeReq.error);
            });
          } catch (e) {

            console.warn('IDBCrypto: Could not persist device entropy, using memory-only');
          }

          resolve(newEntropy);
        }
      };

      request.onerror = () => reject(request.error);
    });
  }

  async function deriveSessionKey(email, password) {
    const enc = new TextEncoder();
    const keyMaterial = await crypto.subtle.importKey(
      'raw', 
      enc.encode(email.toLowerCase().trim() + ':' + password),
      'PBKDF2', 
      false, 
      ['deriveKey']
    );

    return crypto.subtle.deriveKey(
      { 
        name: 'PBKDF2', 
        salt: IDB_KDF_SALT, 
        iterations: PBKDF2_ITERS, 
        hash: 'SHA-256' 
      },
      keyMaterial,
      { name: 'AES-GCM', length: 256 },
      true,
      ['encrypt', 'decrypt']
    );
  }

  async function deriveWrappingKey(wrapSalt) {
    const deviceEntropy = await _getDeviceEntropy();
    const enc = new TextEncoder();

    
    const combined = new Uint8Array(deviceEntropy.length + wrapSalt.length);
    combined.set(deviceEntropy, 0);
    combined.set(wrapSalt, deviceEntropy.length);

    const keyMaterial = await crypto.subtle.importKey(
      'raw',
      combined,
      'PBKDF2',
      false,
      ['deriveKey']
    );

    return crypto.subtle.deriveKey(
      {
        name: 'PBKDF2',
        salt: IDB_KDF_SALT,
        iterations: PBKDF2_ITERS, 
        hash: 'SHA-256'
      },
      keyMaterial,
      { name: 'AES-KW', length: 256 },
      false,
      ['wrapKey', 'unwrapKey']
    );
  }

  async function _persistKey(key, email) {
    try {
      const db = await _initDB();

      
      const wrapSalt = crypto.getRandomValues(new Uint8Array(16));

      
      const wrapKey = await deriveWrappingKey(wrapSalt);

      
      const wrapped = await crypto.subtle.wrapKey('raw', key, wrapKey, 'AES-KW');
      const wrappedBytes = new Uint8Array(wrapped);

      
      const saltHex = Array.from(wrapSalt).map(b => b.toString(16).padStart(2, '0')).join('');
      const keyHex = Array.from(wrappedBytes).map(b => b.toString(16).padStart(2, '0')).join('');

      
      await new Promise((resolve, reject) => {
        const tx = db.transaction(KEY_STORE, 'readwrite');
        const store = tx.objectStore(KEY_STORE);

        const request = store.put({
          id: 'primary',
          email: email,
          salt: saltHex,
          wrappedKey: keyHex,
          version: KEY_VERSION,
          createdAt: Date.now()
        });

        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      });

      

      try {
        sessionStorage.setItem('_gznd_session_key_backup', JSON.stringify({
          email,
          salt: saltHex,
          wrappedKey: keyHex,
          version: KEY_VERSION
        }));
      } catch (e) {

      }

      _keyEmail = email;

      
      _clearLegacyStorage();

    } catch (e) {
      console.error('IDBCrypto: Failed to persist key:', e);
      throw e;
    }
  }

  async function _restoreKey() {
    try {
      const db = await _initDB();

      
      const stored = await new Promise((resolve, reject) => {
        const tx = db.transaction(KEY_STORE, 'readonly');
        const store = tx.objectStore(KEY_STORE);
        const request = store.get('primary');

        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });

      if (stored && stored.salt && stored.wrappedKey) {
        const wrapSalt = new Uint8Array(stored.salt.match(/.{2}/g).map(h => parseInt(h, 16)));
        const wrappedBytes = new Uint8Array(stored.wrappedKey.match(/.{2}/g).map(h => parseInt(h, 16)));

        
        const wrapKey = await deriveWrappingKey(wrapSalt);

        
        const key = await crypto.subtle.unwrapKey(
          'raw',
          wrappedBytes,
          wrapKey,
          'AES-KW',
          { name: 'AES-GCM', length: 256 },
          false,
          ['encrypt', 'decrypt']
        );

        _keyEmail = stored.email;
        return key;
      }

      
      const sessionBackup = sessionStorage.getItem('_gznd_session_key_backup');
      if (sessionBackup) {
        const backup = JSON.parse(sessionBackup);
        if (backup.salt && backup.wrappedKey) {
          const wrapSalt = new Uint8Array(backup.salt.match(/.{2}/g).map(h => parseInt(h, 16)));
          const wrappedBytes = new Uint8Array(backup.wrappedKey.match(/.{2}/g).map(h => parseInt(h, 16)));

          const wrapKey = await deriveWrappingKey(wrapSalt);

          const key = await crypto.subtle.unwrapKey(
            'raw',
            wrappedBytes,
            wrapKey,
            'AES-KW',
            { name: 'AES-GCM', length: 256 },
            false,
            ['encrypt', 'decrypt']
          );

          _keyEmail = backup.email;

          
          await _persistKey(key, backup.email);

          return key;
        }
      }

      
      return await _migrateFromLegacy();

    } catch (e) {
      console.error('IDBCrypto: Failed to restore key:', e);
      return null;
    }
  }

  async function _migrateFromLegacy() {
    try {
      const stored = localStorage.getItem(LEGACY_LS_KEY);
      const wrapSecret = localStorage.getItem(LEGACY_LS_SECRET);
      const email = localStorage.getItem(LEGACY_LS_EMAIL);

      if (!stored || !wrapSecret || !email) return null;

      const [saltHex, keyHex] = stored.split(':');
      if (!saltHex || !keyHex) return null;

      const wrapSalt = new Uint8Array(saltHex.match(/.{2}/g).map(h => parseInt(h, 16)));
      const wrappedBytes = new Uint8Array(keyHex.match(/.{2}/g).map(h => parseInt(h, 16)));

      const enc = new TextEncoder();
      const wkMaterial = await crypto.subtle.importKey('raw', enc.encode(wrapSecret), 'PBKDF2', false, ['deriveKey']);

      const wrapKey = await crypto.subtle.deriveKey(
        { name: 'PBKDF2', salt: wrapSalt, iterations: 10000, hash: 'SHA-256' },
        wkMaterial,
        { name: 'AES-KW', length: 256 },
        false,
        ['unwrapKey']
      );

      const key = await crypto.subtle.unwrapKey(
        'raw',
        wrappedBytes,
        wrapKey,
        'AES-KW',
        { name: 'AES-GCM', length: 256 },
        false,
        ['encrypt', 'decrypt']
      );

      
      await _persistKey(key, email);
      _keyEmail = email;

      
      return key;

    } catch (e) {
      console.error('IDBCrypto: Legacy migration failed:', e);
      return null;
    }
  }

  function _clearLegacyStorage() {
    try {
      localStorage.removeItem(LEGACY_LS_KEY);
      localStorage.removeItem(LEGACY_LS_SECRET);
      localStorage.removeItem(LEGACY_LS_EMAIL);
      localStorage.removeItem('_gznd_key_version');
    } catch (e) {

    }
  }

  return {

    async initialize() {
      try {
        await _initDB();
        return true;
      } catch (e) {
        console.error('IDBCrypto: Initialization failed:', e);
        return false;
      }
    },

    async setSessionKey(email, password) {
      _sessionKey = await deriveSessionKey(email, password);
      await _persistKey(_sessionKey, email);
      _keyEmail = email;
    },

    async restoreSessionKeyFromStorage() {
      if (_sessionKey) return true;

      const key = await _restoreKey();
      if (key) {
        _sessionKey = key;

        return true;
      }
      return false;
    },

    async rederiveKey(email, password) {
      try {
        _sessionKey = await deriveSessionKey(email, password);
        await _persistKey(_sessionKey, email);
        _keyEmail = email;

        return true;
      } catch (e) {
        console.error('IDBCrypto: Failed to re-derive key:', e);
        return false;
      }
    },

    getStoredEmail() {
      return _keyEmail;
    },

    clearSessionKey() {
      _sessionKey = null;
      _keyEmail = null;

      
      _initDB().then(db => {
        const tx = db.transaction([KEY_STORE, ENTROPY_STORE], 'readwrite');
        tx.objectStore(KEY_STORE).delete('primary');
        tx.objectStore(ENTROPY_STORE).delete('primary');
      }).catch(() => {});

      
      try {
        sessionStorage.removeItem('_gznd_session_key_backup');
        sessionStorage.removeItem('_gznd_session_active');
      } catch (e) {}

      
      _clearLegacyStorage();
    },

    isReady() {
      return _sessionKey !== null;
    },

    async encrypt(plainValue) {
      if (!_sessionKey) {
        console.warn('IDBCrypto: Cannot encrypt - no session key');
        return plainValue;
      }

      try {
        const iv = crypto.getRandomValues(new Uint8Array(IV_LEN));
        const plaintext = new TextEncoder().encode(
          typeof plainValue === 'string' ? plainValue : JSON.stringify(plainValue)
        );

        const ciphertext = await crypto.subtle.encrypt(
          { name: 'AES-GCM', iv },
          _sessionKey,
          plaintext
        );

        const ctBytes = new Uint8Array(ciphertext);
        const combined = new Uint8Array(IV_LEN + ctBytes.length);
        combined.set(iv, 0);
        combined.set(ctBytes, IV_LEN);

        let binary = '';
        combined.forEach(b => { binary += String.fromCharCode(b); });

        return ENC_PREFIX + btoa(binary);
      } catch (e) {
        console.error('IDBCrypto: Encryption failed:', e);
        return plainValue;
      }
    },

    async decrypt(encValue) {
      if (!_sessionKey) {
        await this.restoreSessionKeyFromStorage();
      }

      if (!_sessionKey) {
        console.warn('IDBCrypto: Cannot decrypt - no session key available');
        return null;
      }

      if (typeof encValue !== 'string' || !encValue.startsWith(ENC_PREFIX)) {
        return encValue;
      }

      try {
        const b64 = encValue.slice(ENC_PREFIX.length);
        const binary = atob(b64);
        const combined = new Uint8Array(binary.length);

        for (let i = 0; i < binary.length; i++) {
          combined[i] = binary.charCodeAt(i);
        }

        const iv = combined.slice(0, IV_LEN);
        const ciphertext = combined.slice(IV_LEN);

        const plaintext = await crypto.subtle.decrypt(
          { name: 'AES-GCM', iv },
          _sessionKey,
          ciphertext
        );

        const decoded = new TextDecoder().decode(plaintext);

        try {
          return JSON.parse(decoded);
        } catch (e) {
          return decoded;
        }
      } catch (decErr) {
        console.error('IDBCrypto: Decryption failed:', decErr);
        return null;
      }
    },

    async validateKey() {
      if (!_sessionKey) return false;

      try {
        const testValue = 'test_' + Date.now();
        const encrypted = await this.encrypt(testValue);
        if (encrypted === testValue) return false;
        const decrypted = await this.decrypt(encrypted);
        return decrypted === testValue;
      } catch (e) {
        return false;
      }
    }
  };
})();
let currentActiveTab = 'prod';
