import { ACCOUNT_ROLES, ROLE_LABELS, accountDisplayName, normalizeRole } from './account-roles.js';

const esc = (v) => String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

export function canAdoptAccount(existing, { owner, adminEmail }) {
  if (!existing) return { ok: true };
  if (existing.ownerUid && existing.ownerUid !== owner) {
    return { ok: false, reason: 'This email belongs to another workspace.' };
  }
  if (existing.ownerUid === owner) return { ok: true };
  const mine = (existing.createdByUid && existing.createdByUid === owner)
    || (existing.createdBy && adminEmail && String(existing.createdBy).toLowerCase() === String(adminEmail).toLowerCase());
  if (mine) return { ok: true };
  return { ok: false, reason: 'This email already has its own workspace and cannot be added here.' };
}

export function roleButtonsHtml(selected, onclick, extraAttrs = '') {
  const sel = selected ? normalizeRole(selected) : null;
  return ACCOUNT_ROLES.map(r =>
    '<button type="button" class="toggle-opt u-b4cd53b' + (sel === r ? ' active' : '') + '" data-role="' + r + '"' + extraAttrs +
    ' onclick="' + onclick + '">' + ROLE_LABELS[r] + '</button>'
  ).join('');
}

export function accountRowHtml(acct, { isMe = false, isOwner = false } = {}) {
  const approved = acct.approved !== false;
  const role = normalizeRole(acct.role) || 'admin';
  const locked = isMe || isOwner;
  const dot = '<span class="u-eca6a09 d-inline-block ' + (approved ? 'st-background__1ffaf3' : 'st-background__047b23') + '"></span>';
  const who = isMe ? ' <em class="st-color__5872de st-font-size__c3e9d8">(you)</em>'
    : isOwner ? ' <em class="st-color__5872de st-font-size__c3e9d8">(owner)</em>' : '';
  const badge = '<span class="' + (role === 'admin' ? 'u-e4e2d96' : 'u-e7a1434') + ' st-background__f38efd st-border-bottom__e54b2f">' + esc(ROLE_LABELS[role]) + '</span>';
  const nameLine = '<span class="u-e7a1434">' + esc(accountDisplayName(acct)) + '</span>';
  const attrs = ' data-uid="' + esc(acct.uid) + '" data-email="' + esc(acct.email || '') + '"';
  let body = '';
  if (!locked) {
    body += '<div class="u-0762397 d-flex acct-roles">' +
      roleButtonsHtml(role, 'setAccountRole(this.dataset.uid,this.dataset.email,this.dataset.role)', attrs) + '</div>';
    body += '<div class="d-flex acct-actions">' +
      '<button type="button" class="btn btn-theme st-font-size__569d78 st-padding__8f18e9"' + attrs + ' data-approved="' + approved + '" onclick="adminToggleApproval(this.dataset.uid,this.dataset.email,this.dataset.approved===\'true\')">' + (approved ? 'Suspend' : 'Reinstate') + '</button>' +
      '<button type="button" class="btn btn-theme u-af19549 st-border-bottom__763610"' + attrs + ' onclick="adminRemoveAccount(this.dataset.uid,this.dataset.email)">Remove</button></div>';
  }
  return '<div class="acct-card st-background__f38efd st-border-bottom__e54b2f">' +
    '<div class="u-855cc88 d-flex">' + dot + '<div class="u-33f2a66"><div class="u-d2751c2 has-overflow u-0da05dd">' + esc(acct.email || acct.uid) + who + '</div>' +
    '<div class="u-28c8f7e d-flex">' + badge + nameLine + (!approved ? '<span class="u-d857e96">· Suspended</span>' : '') + '</div></div></div>' + body + '</div>';
}
