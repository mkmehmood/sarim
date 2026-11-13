import{a as F,b as T,c as U,e as E,f as k,g as A,h as V,i as D}from"./chunk-5DKAJ6RK.js";import{a as o,b as H,c as u,d,e as m,f as S,g as P,h as j,i as R,j as b,k as q,l as B,m as N,n as O,o as G,p as M}from"./chunk-25EX4EIR.js";import{Be as L,Cb as W,E as $,Hb as x,rb as c}from"./chunk-OYWD7JPR.js";var e={formulas:[],formula:null,mode:"total",unit:"kg",plan:null,editingId:null},f=t=>e.unit==="g"?t*1e3:t,Q=t=>e.unit==="g"?t/1e3:t,p=t=>H(f(t),e.unit),X=t=>t==="units"?"Number of Units":t==="ingredient"?`Ingredient on Hand (${e.unit})`:`Total Batch Weight (${e.unit})`,K=t=>`<div class="u-fs-sm2 u-text-muted u-mb-15">${t}</div>`;function w(){return e.formula?F(e.formula):[]}function C(t,n){let i=w(),a=i.find(h=>h.id===String(t))||i[0]||null,l=o("bm-ing-select");l&&(l.value=a?a.id:"");let r=o("bm-ing-btn"),s=r?r.querySelector("span"):null;s&&(s.textContent=a?a.name:"Select ingredient"),n||g()}function y(){let t=e.formula,n=w(),i=o("bm-ing-select");C(i?i.value:"",!0);let a=o("bmFormulaInfo");a&&(a.textContent=t?`1 unit = ${p(T(t))} ${e.unit} \xB7 ${n.length} ingredient${n.length===1?"":"s"}`:"")}function Z(t){B(t,"_pop_batchMixIng",w().map(n=>({id:n.id,name:`${n.name} (${p(n.quantity)} ${e.unit} / unit)`})),n=>C(n))}function g(){let t=o("bmMakeResult");if(!t)return;let n=e.formula;if(e.plan=null,d("bmSaveBar",!1),!n){t.innerHTML=K("Select a formula");return}let i=parseFloat(o("bm-value").value)||0,a=e.mode==="units"?i:Q(i),l=U(n,e.mode,a,o("bm-ing-select").value);if(!l.units){t.innerHTML=K("Enter a value to build the batch");return}e.plan=l,d("bmSaveBar",!0);let r=e.unit,s=m("Units",j(l.units))+m("Weight per Unit",`${p(l.unitWeight)} ${r}`)+m("Total Batch Weight",`${p(l.totalWeight)} ${r}`,"rev-val"),h=l.rows.map(_=>m(L(_.name),`${p(_.total)} ${r}`)).join("");t.innerHTML=S(s)+P("Required Ingredients")+S(h)}function I(t){e.mode=t==="units"||t==="ingredient"?t:"total",b("[data-bm-mode]","data-bm-mode",e.mode),d("bmIngWrap",e.mode==="ingredient");let n=o("bmValueLabel");n&&(n.textContent=X(e.mode)),g()}function tt(t){let n=t==="g"?"g":"kg",i=e.unit;if(n===i)return;let a=o("bm-value");a&&e.mode!=="units"&&(a.value=R(a.value,i,n)),e.unit=n,b("[data-bm-unit]","data-bm-unit",n);let l=o("bmValueLabel");l&&(l.textContent=X(e.mode)),y(),g()}function v(){e.editingId=null;let t=o("bm-save-name");t&&(t.value=""),M("bmSaveBtn","bmCancelBtn",!1,"Calculation"),Y()}function Y(){let t=k(e.formula).filter(a=>a.kind==="batch");d("bmSavedWrap",t.length>0);let n=o("bmSavedCount");n&&(n.textContent=t.length?`(${t.length})`:"");let i=o("bmSaved");i&&(i.innerHTML=G(t,"editBatchMixSaved","deleteBatchMixSaved"))}async function z(){e.formulas=await W();let t=e.formula?String(e.formula.id):"";e.formula=e.formulas.find(n=>String(n.id)===t)||null}async function nt(){let t=e.formula,n=e.plan;if(!t||!n||!n.units){c("Enter a value to build the batch first","warning");return}let i=Date.now(),a={id:e.editingId||O(),kind:"batch",name:(o("bm-save-name").value||"").trim()||D(t,"batch",i),unit:e.unit,mode:e.mode,value:String(o("bm-value").value),ingredientId:o("bm-ing-select").value||"",units:u(n.units),unitWeight:u(f(n.unitWeight)),totalWeight:u(f(n.totalWeight)),rows:n.rows.map(s=>({n:s.name,p:u(f(s.perUnit)),t:u(f(s.total))})),createdAt:i,updatedAt:i},l=!!e.editingId,r=await x(t.id,s=>A(s,a));if(!r.ok){c(r.error==="limit"?`You can keep up to ${E} saved calculations per formula. Delete an old one first.`:r.error,"warning");return}await z(),v(),c(l?"Calculation updated":"Calculation saved","success")}function et(t){let n=k(e.formula).find(a=>String(a.id)===String(t)&&a.kind==="batch");if(!n)return;e.unit=n.unit==="g"?"g":"kg",b("[data-bm-unit]","data-bm-unit",e.unit),e.editingId=n.id,o("bm-value").value=n.value||"",o("bm-save-name").value=n.name||"",y(),n.ingredientId&&C(n.ingredientId,!0),I(n.mode),M("bmSaveBtn","bmCancelBtn",!0,"Calculation");let i=o("bm-formula-btn");i&&typeof i.scrollIntoView=="function"&&i.scrollIntoView({block:"start"})}function it(){v()}async function at(t){let n=e.formula;if(!n||!await $("Delete this saved calculation?",{title:"Delete Calculation",confirmText:"Delete",danger:!0}))return;let a=await x(n.id,l=>({ok:!0,list:V(l,t)}));if(!a.ok){c(a.error,"warning");return}await z(),e.editingId===String(t)?v():Y(),c("Calculation deleted","success")}function J(t){e.formula=e.formulas.find(n=>String(n.id)===String(t))||null,N("bm-formula-btn","bm-formula-select",e.formula),v(),y(),g()}function ot(t){B(t,"_pop_batchMix",e.formulas,J)}async function lt(t){let n=await q();if(!n)return;e.formulas=n;let i=o("bm-value");i&&(i.value=""),J(t||n[0].id),b("[data-bm-unit]","data-bm-unit",e.unit),I("total"),typeof window.openStandaloneScreen=="function"&&window.openStandaloneScreen("batch-mix-screen")}Object.assign(window,{saveBatchMix:nt,editBatchMixSaved:et,cancelBatchMixEdit:it,deleteBatchMixSaved:at,openBatchMix:lt,openBatchMixFormulaPicker:ot,openBatchMixIngredientPicker:Z,setBatchMixMode:I,setBatchMixUnit:tt,recomputeBatchMix:g});var bt=`<div id="batch-mix-screen" class="standalone-screen d-none">
  <div class="shell-bar screen-topbar">
    <h2 class="screen-title">Batching</h2>
  </div>
  <div class="screen-body">
    <div class="field u-mb-15">
      <label>Formula</label>
      <input type="hidden" id="bm-formula-select" value="">
      <button type="button" id="bm-formula-btn" class="form-ctl bm-picker" onclick="openBatchMixFormulaPicker(this)"><span>Select formula</span><svg class="ic-chev" width="12" height="12" viewBox="0 0 10 10" fill="none"><circle cx="5" cy="5" r="4.8" fill="currentColor" fill-opacity=".12"/><path d="M2.6 3.9L5 6.3L7.4 3.9" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg></button>
      <div class="u-field-hint-xs" id="bmFormulaInfo"></div>
    </div>
    <div class="toggle-group u-mb-15 bm-unit" role="group">
      <button type="button" class="toggle-opt" data-bm-unit="g" aria-pressed="false" onclick="setBatchMixUnit('g')">g</button>
      <button type="button" class="toggle-opt active" data-bm-unit="kg" aria-pressed="true" onclick="setBatchMixUnit('kg')">kg</button>
    </div>
    <div class="toggle-group u-mb-15" role="group">
      <button type="button" class="toggle-opt active" data-bm-mode="total" aria-pressed="true" onclick="setBatchMixMode('total')">Weight</button>
      <button type="button" class="toggle-opt" data-bm-mode="units" aria-pressed="false" onclick="setBatchMixMode('units')">Units</button>
      <button type="button" class="toggle-opt" data-bm-mode="ingredient" aria-pressed="false" onclick="setBatchMixMode('ingredient')">Ingredient</button>
    </div>
    <div class="field u-mb-15 d-none" id="bmIngWrap">
      <label>Ingredient</label>
      <input type="hidden" id="bm-ing-select" value="">
      <button type="button" id="bm-ing-btn" class="form-ctl bm-picker" onclick="openBatchMixIngredientPicker(this)"><span>Select ingredient</span><svg class="ic-chev" width="12" height="12" viewBox="0 0 10 10" fill="none"><circle cx="5" cy="5" r="4.8" fill="currentColor" fill-opacity=".12"/><path d="M2.6 3.9L5 6.3L7.4 3.9" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg></button>
    </div>
    <div class="field u-mb-15">
      <label id="bmValueLabel">Total Batch Weight (kg)</label>
      <input class="form-ctl" type="number" id="bm-value" inputmode="decimal" step="any" min="0" oninput="recomputeBatchMix()">
    </div>
    <div id="bmMakeResult"></div>
    <div id="bmSaveBar" class="u-mb-15 d-none">
      <div class="field u-mb-15">
        <label>Name (optional)</label>
        <input class="form-ctl" type="text" id="bm-save-name" maxlength="60" placeholder="e.g. Morning batch">
      </div>
      <div class="btn-split">
        <button type="button" class="btn btn-theme u-81e32d3 d-none" id="bmCancelBtn" onclick="cancelBatchMixEdit()">Cancel Edit</button>
        <button type="button" class="btn btn-main u-mt-8 u-16000cc" id="bmSaveBtn" onclick="saveBatchMix()">Save Calculation</button>
      </div>
    </div>
    <div id="bmSavedWrap" class="d-none">
      <label class="u-5250855 d-block">Saved Calculations <span id="bmSavedCount"></span></label>
      <div id="bmSaved" class="history-list report-grid"></div>
    </div>
  </div>
</div>`,ft=`
`;export{ft as __screenCss,bt as __screenHtml,it as cancelBatchMixEdit,at as deleteBatchMixSaved,et as editBatchMixSaved,lt as openBatchMix,ot as openBatchMixFormulaPicker,Z as openBatchMixIngredientPicker,g as recomputeBatchMix,nt as saveBatchMix,I as setBatchMixMode,tt as setBatchMixUnit};
