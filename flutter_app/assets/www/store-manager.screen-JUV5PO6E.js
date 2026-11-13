async function f(){openStandaloneScreen("store-manager-screen"),await l(),u()}window.openStoreManagerScreen=f;async function l(){let e=await(typeof window.getAppStores=="function"?window.getAppStores():Promise.resolve([])),i=document.getElementById("store-list-container");if(!i)return;let n=[];try{n=typeof window.sqliteStore!="undefined"?await window.sqliteStore.get("production")||[]:[]}catch(t){}let r=new Set(n.map(t=>t.store).filter(Boolean));if(!e.length){i.innerHTML='<p class="u-d67835a">No stores found.</p>';return}let s=typeof window.getStoreFormulaNames=="function"?await window.getStoreFormulaNames():{};i.innerHTML=e.map((t,a)=>{let d=r.has(t.key),o=typeof window.isBuiltinStoreKey=="function"?window.isBuiltinStoreKey(t.key):!1;return`
    <div class="card settings-list-item u-5c12a4f">
      <div class="u-2757ede d-flex">
        <div class="u-c560d14 d-flex st-background__fbe8aa st-border-bottom__710d95">
          ${(t.name||"?").slice(0,2)}
        </div>
        <div class="u-8b4ab7f">
          <div class="u-4f111f5">${t.name}</div>
          <div class="u-65c72da">
            Key: <span class="u-1e86a25">${t.key}</span>
            &nbsp;\xB7&nbsp;
            <span class="u-text-accent">${s[t.key]||"No formula"}</span>
            ${d?'&nbsp;\xB7&nbsp;<span class="st-color__5872de">Has records</span>':""}
          </div>
          <div class="u-6ca7dd1">
            Sale Price: ${t.salePrice!=null&&t.salePrice>0?t.salePrice:0}/kg
          </div>
        </div>
        <div class="u-3141675 d-flex">
          <button onclick="editStore(${a})" class="btn btn-theme btn-sm">Edit</button>
          ${!o&&!d?`<button onclick="deleteStore(${a})" class="text-xs st-background__474cf1 st-border-bottom__23471e st-color__497726 st-border-radius__28a50d st-padding__b2e03a st-font-size__8e87b7 st-font-weight__e3ec02 st-cursor__3b6a3a">Delete</button>`:""}
        </div>
      </div>
    </div>`}).join("")}window.renderStoreList=l;function u(){document.getElementById("store-edit-index").value="-1",document.getElementById("store-name-input").value="",document.getElementById("store-sale-price-input").value="0",typeof window.setStoreFormulaSelection=="function"&&window.setStoreFormulaSelection(""),document.getElementById("store-form-heading").textContent="New Store",document.getElementById("store-save-btn-text").textContent="Add Store";let e=document.getElementById("store-cancel-edit-btn");e&&window.setDisplay(e,"none")}window.resetStoreForm=u;async function p(e){let n=(await(typeof window.getAppStores=="function"?window.getAppStores():Promise.resolve([])))[e];if(!n)return;document.getElementById("store-edit-index").value=String(e),document.getElementById("store-name-input").value=n.name,document.getElementById("store-sale-price-input").value=n.salePrice||0,typeof window.setStoreFormulaSelection=="function"&&await window.setStoreFormulaSelection(n.formulaId||""),document.getElementById("store-form-heading").textContent="Edit Store",document.getElementById("store-save-btn-text").textContent="Save Changes";let r=document.getElementById("store-cancel-edit-btn");r&&window.setDisplay(r,""),document.getElementById("store-name-input").focus()}window.editStore=p;async function g(e){let i=await(typeof window.getAppStores=="function"?window.getAppStores():Promise.resolve([])),n=i[e];!n||!await(typeof window.showGlassConfirm=="function"?window.showGlassConfirm('Delete store "'+n.name+`"?
This cannot be undone.`,{title:"Delete Store",confirmText:"Delete",cancelText:"Cancel",icon:"\u{1F5D1}"}):Promise.resolve(window.confirm('Delete store "'+n.name+'"?')))||(i.splice(e,1),await window.sqliteStore.set("stores",i),await window.sqliteStore.set("stores_timestamp",Date.now()),typeof window._invalidateStoresCache=="function"&&window._invalidateStoresCache(),typeof window.triggerAutoSync=="function"&&window.triggerAutoSync(),await l(),typeof window.rebuildStoreUI=="function"&&await window.rebuildStoreUI(),typeof window.sendDeviceNotification=="function"&&window.sendDeviceNotification("Store deleted",n.name,"store-del-"+n.key).catch(function(){}))}window.deleteStore=g;async function y(){let e=(document.getElementById("store-name-input").value||"").trim().toUpperCase(),i=document.getElementById("store-formula-select").value||"",n=parseFloat(document.getElementById("store-sale-price-input").value),r=isNaN(n)||n<0?0:n,s=parseInt(document.getElementById("store-edit-index").value,10);if(!e){typeof window.showToast=="function"&&window.showToast("Store name is required","warning");return}if(!i){typeof window.showToast=="function"&&window.showToast("Select a formula from the Formula Store","warning");return}let t=(await(typeof window.getAppStores=="function"?window.getAppStores():Promise.resolve([]))).map(function(o){return Object.assign({},o)});if(s>=0){let o=t[s];if(!o)return;if(t.findIndex((c,m)=>m!==s&&c.name===e)>=0){typeof window.showToast=="function"&&window.showToast("A store with this name already exists","warning");return}o.name=e,o.formulaId=i,o.salePrice=isNaN(n)?o.salePrice>0?o.salePrice:0:r}else{let o=window.makeStoreKey(e,t.map(function(c){return c.key}));if(t.findIndex(c=>c.name===e)>=0){typeof window.showToast=="function"&&window.showToast("A store with this name already exists","warning");return}t.push({key:o,name:e,formulaId:i,salePrice:r})}if(typeof window.showGlassConfirm=="function"&&!await window.showGlassConfirm((s>=0?'Update store "':'Add store "')+e+`"?
Please review the details before continuing.`,{title:s>=0?"Update Store?":"Save Store?",confirmText:s>=0?"Update":"Save",cancelText:"Cancel",tone:s>=0?"warning":"primary"}))return;let a=await window.commitStoresWithFormulas(t);if(!a.ok){window.notifyBlocking(a.error,"warning","Warning");return}if(u(),await l(),typeof window.rebuildStoreUI=="function"&&await window.rebuildStoreUI(),typeof window.sendDeviceNotification=="function"){var d=(a.stores||[]).find(function(o){return o.name===e})||{};window.sendDeviceNotification(s>=0?"Store updated":"Store added",e+" \u2014 sale price "+(d.salePrice>0?d.salePrice:0)+"/kg","store-"+(d.key||e)).catch(function(){})}}window.saveStoreFromForm=y;var v=`<div id="store-manager-screen" class="standalone-screen d-none">
  <div class="shell-bar screen-topbar">
    <h2 class="screen-title">Store Manager</h2>
  </div>
  <div class="screen-body" id="store-manager-body">
    <div class="card u-d8ddece st-border-bottom__e54b2f">
      <p class="settings-group-label" id="store-form-heading">New Store</p>
      <input type="hidden" id="store-edit-index" value="-1">
      <div class="grid-inputs u-mb-15">
        <div class="field">
          <label>Store Name</label>
          <input type="text" id="store-name-input" placeholder="e.g. KARACHI" maxlength="32" class="form-ctl u-3d59ac9" oninput="this.value=this.value.toUpperCase()">
        </div>
        <div class="field">
          <label>Formula</label>
          <input type="hidden" id="store-formula-select" value="">
          <button type="button" id="store-formula-btn" class="form-ctl u-e17a8ec d-flex" onclick="openStoreFormulaPicker(this)"><span>Select formula</span><svg class="ic-chev" width="12" height="12" viewBox="0 0 10 10" fill="none"><circle cx="5" cy="5" r="4.8" fill="currentColor" fill-opacity=".12"/><path d="M2.6 3.9L5 6.3L7.4 3.9" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg></button>
        </div>
        <div class="field">
          <label>Sale Price (per kg)</label>
          <input class="form-ctl" type="number" id="store-sale-price-input" step="0.01" min="0" value="0">
        </div>
      </div>
      <div class="u-1e68903 d-flex btn-row btn-split">
        <button class="btn btn-theme u-d59bb54 d-none st-background__f38efd" id="store-cancel-edit-btn" onclick="resetStoreForm()">Cancel</button>
        <button class="btn btn-main u-mt-8 u-634a28b" onclick="(async()=>{await saveStoreFromForm()})()">
          <span id="store-save-btn-text">Add Store</span>
        </button>
      </div>
    </div>
    <p class="settings-group-label">Existing Stores</p>
    <div id="store-list-container"></div>
    <div class="u-5efdd87 st-background__5e344c st-border-bottom__167edb">
      <strong class="u-cab13eb">Note:</strong> A store's key is generated from its name when the store is created (ZUBAIR becomes <code>zubair</code>). It is permanent and links to all historical records, so renaming a store later is safe.
      Renaming a store updates its display name everywhere. Deleting is only allowed if the store has no production records.
      Changes sync to all connected devices automatically.
    </div>
  </div>
</div>`,b=`
`;export{b as __screenCss,v as __screenHtml};
