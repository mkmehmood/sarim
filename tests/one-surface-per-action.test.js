import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(new URL('..', import.meta.url).pathname);
const files = [...fs.readdirSync(path.join(root, 'modules')).filter((f) => f.endsWith('.js')).map((f) => path.join('modules', f)), 'index.html'];

describe('one surface per action: dialog + device notification, or toast, never both', () => {
  it('no in-app toast is shown next to a device notification for the same action', () => {
    const offenders = [];
    for (const f of files) {
      const lines = fs.readFileSync(path.join(root, f), 'utf8').split('\n');
      lines.forEach((line, i) => {
        if (!/(sendDeviceNotification|notifyAction)\(/.test(line) || /export (async )?function/.test(line)) return;
        const near = lines.slice(Math.max(0, i - 6), i + 7).join('\n');
        if (/showToast\(/.test(near)) offenders.push(`${f}:${i + 1}`);
      });
    }
    assert.deepEqual(offenders, []);
  });

  it('a displayed toast is not mirrored to a device notification', () => {
    const src = fs.readFileSync(path.join(root, 'modules/customers.js'), 'utf8');
    const body = src.slice(src.indexOf('export function showToast('), src.indexOf('window.showToast = showToast'));
    const uses = body.match(/notifyFromToast\(/g) || [];
    assert.equal(uses.length, 1, 'only the save/delete/update branch (which shows no toast) may call notifyFromToast');
    const branch = body.slice(body.indexOf('isActionToast'), body.indexOf('_toastQueue.push'));
    assert.match(branch, /notifyFromToast/);
    assert.match(branch, /return;/);
  });
});
