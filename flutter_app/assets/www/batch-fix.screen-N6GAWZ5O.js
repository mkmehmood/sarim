import{a as T,d as q,e as R,f as B,g as E,h as _,i as M}from"./chunk-5DKAJ6RK.js";import{a as o,b as g,c as d,d as h,i as y,j as $,k as I,l as L,m as U,n as D,o as H,p as k}from"./chunk-25EX4EIR.js";import{Be as b,Cb as A,E as F,Hb as w,rb as m}from"./chunk-OYWD7JPR.js";var a={formulas:[],formula:null,manual:null,unit:"g",plan:null,editingId:null},c=n=>`${g(n,a.unit)} ${a.unit}`,N=n=>parseFloat((o(n)||{}).value)||0;function P(){let n={};return document.querySelectorAll("#bfActualRows input[data-id]").forEach(t=>{n[t.dataset.id]=t.value}),n}function C(){$("[data-bf-unit]","data-bf-unit",a.unit),document.querySelectorAll("#batch-fix-screen .bf-u").forEach(n=>{n.textContent=a.unit})}function W(n,t){return`<div class="field"><label>${b(n.name)} (<span class="bf-u">${a.unit}</span>)</label><input class="form-ctl" type="number" inputmode="decimal" step="any" min="0" data-id="${b(n.id)}" oninput="${t}"></div>`}function z(){let n=a.formula?T(a.formula):[],t=o("bfRows");t&&(t.innerHTML=n.map(i=>`<div class="card bf-card" data-id="${b(i.id)}"><div class="bf-card-top"><div class="bf-name">${b(i.name)}</div><label class="bf-add"><span class="bf-add-tag">Add</span><input class="form-ctl" type="number" inputmode="decimal" step="any" min="0" data-id="${b(i.id)}" oninput="setBatchFixAdd(this)"><span class="bf-u">${a.unit}</span></label></div><div class="bf-meta"><span>In remaining <b data-f="present"></b></span><span>Required <b data-f="target"></b></span></div></div>`).join(""));let e=o("bfActualRows");e&&(e.innerHTML=n.map(i=>W(i,"resetBatchFixManual()")).join("")),C()}function u(n){let t=a.formula,e=N("bf-original"),i=N("bf-used"),r=o("bfRemaining");r&&(r.textContent=e>0?c(Math.max(0,e-i)):c(0));let l=t?q(t,{original:e,used:i,actual:P(),manual:a.manual}):{ok:!1,error:"empty"};a.plan=l.ok?l:null;let f=o("bfEmpty");if(f&&(f.textContent=l.error==="nothing-left"?"Used / Lost must be less than the Original Batch":t?"Enter the original batch weight":"Select a formula"),h("bfEmpty",!l.ok),h("bfBody",l.ok),!l.ok)return;l.rows.forEach(p=>{let v=document.querySelector(`#bfRows .bf-card[data-id="${CSS.escape(p.id)}"]`);if(!v)return;v.querySelector('[data-f="present"]').textContent=c(p.present),v.querySelector('[data-f="target"]').textContent=c(p.target);let S=v.querySelector("input[data-id]");S&&S!==n&&(S.value=g(p.add,a.unit))}),o("bfNewTotal").textContent=c(l.requiredTotal),o("bfTotalRemaining").textContent=c(l.remaining),o("bfTotalRequired").textContent=c(l.requiredTotal);let s=o("bfTotalAdd");s&&s!==n&&(s.value=g(l.addTotal,a.unit))}function G(n){let t=n.value.trim();a.manual=t===""?null:{id:n.dataset.id,add:t},u(n)}function X(n){let t=n.value.trim();a.manual=t===""?null:{total:t},u(n)}function Y(){a.manual=null,u()}function J(n){let t=n==="kg"?"kg":"g",e=a.unit;t!==e&&(document.querySelectorAll("#bf-original, #bf-used, #bfActualRows input").forEach(i=>{i.value=y(i.value,e,t)}),a.manual&&(a.manual=a.manual.total!==void 0?{total:y(a.manual.total,e,t)}:{...a.manual,add:y(a.manual.add,e,t)}),a.unit=t,C(),u())}function x(){a.editingId=null;let n=o("bf-save-name");n&&(n.value=""),k("bfSaveBtn","bfCancelBtn",!1,"Correction"),j()}function j(){let n=B(a.formula).filter(i=>i.kind==="fix");h("bfSavedWrap",n.length>0);let t=o("bfSavedCount");t&&(t.textContent=n.length?`(${n.length})`:"");let e=o("bfSaved");e&&(e.innerHTML=H(n,"editBatchFixSaved","deleteBatchFixSaved"))}async function O(){a.formulas=await A();let n=a.formula?String(a.formula.id):"";a.formula=a.formulas.find(t=>String(t.id)===n)||null}async function K(){let n=a.formula,t=a.plan;if(!n||!t){m("Enter the original batch weight first","warning");return}let e=Date.now(),i=[];document.querySelectorAll("#bfActualRows input[data-id]").forEach(s=>{s.value.trim()!==""&&i.push({i:s.dataset.id,v:s.value})});let r={id:a.editingId||D(),kind:"fix",name:(o("bf-save-name").value||"").trim()||M(n,"fix",e),unit:a.unit,original:String(o("bf-original").value),used:String(o("bf-used").value),actual:i,remaining:d(t.remaining),requiredTotal:d(t.requiredTotal),addTotal:d(t.addTotal),rows:t.rows.map(s=>({n:s.name,p:d(s.present),a:d(s.add),t:d(s.target)})),createdAt:e,updatedAt:e};a.manual&&a.manual.total!==void 0?r.manualTotal=String(a.manual.total):a.manual&&(r.manual={i:String(a.manual.id),v:String(a.manual.add)});let l=!!a.editingId,f=await w(n.id,s=>E(s,r));if(!f.ok){m(f.error==="limit"?`You can keep up to ${R} saved calculations per formula. Delete an old one first.`:f.error,"warning");return}await O(),x(),m(l?"Correction updated":"Correction saved","success")}function Q(n){let t=B(a.formula).find(l=>String(l.id)===String(n)&&l.kind==="fix");if(!t)return;a.unit=t.unit==="kg"?"kg":"g",a.editingId=t.id,a.manual=t.manualTotal!==void 0?{total:t.manualTotal}:t.manual?{id:t.manual.i,add:t.manual.v}:null,o("bf-original").value=t.original||"",o("bf-used").value=t.used||"",o("bf-save-name").value=t.name||"";let e=new Map((Array.isArray(t.actual)?t.actual:[]).map(l=>[String(l.i),l.v]));document.querySelectorAll("#bfActualRows input[data-id]").forEach(l=>{l.value=e.has(l.dataset.id)?e.get(l.dataset.id):""});let i=document.querySelector("#batch-fix-screen .bf-actual");i&&(i.open=e.size>0),C(),u(),k("bfSaveBtn","bfCancelBtn",!0,"Correction");let r=o("bf-formula-btn");r&&typeof r.scrollIntoView=="function"&&r.scrollIntoView({block:"start"})}function Z(){x()}async function tt(n){let t=a.formula;if(!t||!await F("Delete this saved correction?",{title:"Delete Correction",confirmText:"Delete",danger:!0}))return;let i=await w(t.id,r=>({ok:!0,list:_(r,n)}));if(!i.ok){m(i.error,"warning");return}await O(),a.editingId===String(n)?x():j(),m("Correction deleted","success")}function V(n){a.formula=a.formulas.find(t=>String(t.id)===String(n))||null,a.manual=null,U("bf-formula-btn","bf-formula-select",a.formula),x(),z(),u()}function at(n){L(n,"_pop_batchFix",a.formulas,V)}async function nt(n){let t=await I();t&&(a.formulas=t,["bf-original","bf-used"].forEach(e=>{let i=o(e);i&&(i.value="")}),V(n||t[0].id),typeof window.openStandaloneScreen=="function"&&window.openStandaloneScreen("batch-fix-screen"))}Object.assign(window,{saveBatchFix:K,editBatchFixSaved:Q,cancelBatchFixEdit:Z,deleteBatchFixSaved:tt,openBatchFix:nt,openBatchFixFormulaPicker:at,setBatchFixAdd:G,setBatchFixTotal:X,setBatchFixUnit:J,resetBatchFixManual:Y,recomputeBatchFix:u});var dt=`<div id="batch-fix-screen" class="standalone-screen d-none">
  <div class="shell-bar screen-topbar">
    <h2 class="screen-title">Batch Correction</h2>
  </div>
  <div class="screen-body">
    <div class="field u-mb-15">
      <label>Formula</label>
      <input type="hidden" id="bf-formula-select" value="">
      <button type="button" id="bf-formula-btn" class="form-ctl bm-picker" onclick="openBatchFixFormulaPicker(this)"><span>Select formula</span><svg class="ic-chev" width="12" height="12" viewBox="0 0 10 10" fill="none"><circle cx="5" cy="5" r="4.8" fill="currentColor" fill-opacity=".12"/><path d="M2.6 3.9L5 6.3L7.4 3.9" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg></button>
    </div>
    <div class="toggle-group u-mb-15 bm-unit" role="group">
      <button type="button" class="toggle-opt active" data-bf-unit="g" aria-pressed="true" onclick="setBatchFixUnit('g')">g</button>
      <button type="button" class="toggle-opt" data-bf-unit="kg" aria-pressed="false" onclick="setBatchFixUnit('kg')">kg</button>
    </div>
    <div class="card">
      <div class="section-header">
        <h3 class="u-ba60f64">Batch Correction</h3>
      </div>
      <div class="grid-inputs">
        <div class="field">
          <label>Original Batch (<span class="bf-u">g</span>)</label>
          <input class="form-ctl" type="number" id="bf-original" inputmode="decimal" step="any" min="0" oninput="resetBatchFixManual()">
        </div>
        <div class="field">
          <label>Used / Lost (<span class="bf-u">g</span>)</label>
          <input class="form-ctl" type="number" id="bf-used" inputmode="decimal" step="any" min="0" oninput="resetBatchFixManual()">
        </div>
      </div>
      <div class="factory-summary-row"><span class="factory-summary-label">Remaining Batch</span><span class="cost-val" id="bfRemaining">0 g</span></div>
      <details class="bf-actual">
        <summary>Mixed differently than the formula?</summary>
        <div class="grid-inputs" id="bfActualRows"></div>
      </details>
    </div>
    <div class="u-fs-sm2 u-text-muted u-mb-15" id="bfEmpty">Select a formula</div>
    <div id="bfBody" class="d-none">
      <div class="card">
        <div class="section-header">
          <h3 class="u-ba60f64">Required Additions</h3>
          <div class="bf-newtotal"><span>New total</span><strong class="cost-val" id="bfNewTotal">0 g</strong></div>
        </div>
        <div class="bf-hint">Type a new amount in any Add box or in Total to Add \u2013 all other ingredients update automatically to keep the formula ratio.</div>
        <div id="bfRows"></div>
        <div class="factory-summary-row"><span class="factory-summary-label">Total in Remaining</span><span class="qty-val" id="bfTotalRemaining">0 g</span></div>
        <div class="factory-summary-row"><span class="factory-summary-label">Total Required</span><span class="qty-val" id="bfTotalRequired">0 g</span></div>
        <div class="field u-mt-8">
          <label>Total to Add (<span class="bf-u">g</span>)</label>
          <input type="number" id="bfTotalAdd" class="form-ctl bf-total-input" inputmode="decimal" step="any" min="0" oninput="setBatchFixTotal(this)">
        </div>
      </div>
      <div id="bfSaveBar" class="u-mb-15">
      <div class="field u-mb-15">
        <label>Name (optional)</label>
        <input class="form-ctl" type="text" id="bf-save-name" maxlength="60" placeholder="e.g. Morning batch">
      </div>
      <div class="btn-split">
        <button type="button" class="btn btn-theme u-81e32d3 d-none" id="bfCancelBtn" onclick="cancelBatchFixEdit()">Cancel Edit</button>
        <button type="button" class="btn btn-main u-mt-8 u-16000cc" id="bfSaveBtn" onclick="saveBatchFix()">Save Correction</button>
      </div>
    </div>
    </div>
    <div id="bfSavedWrap" class="d-none">
      <label class="u-5250855 d-block">Saved Corrections <span id="bfSavedCount"></span></label>
      <div id="bfSaved" class="history-list report-grid"></div>
    </div>
  </div>
</div>`,ct=`
`;export{ct as __screenCss,dt as __screenHtml,Z as cancelBatchFixEdit,tt as deleteBatchFixSaved,Q as editBatchFixSaved,nt as openBatchFix,at as openBatchFixFormulaPicker,u as recomputeBatchFix,Y as resetBatchFixManual,K as saveBatchFix,G as setBatchFixAdd,X as setBatchFixTotal,J as setBatchFixUnit};
