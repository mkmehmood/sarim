window.loadDbStructureScreen=async function(){var e=document.getElementById("delta-sync-details-container");if(e){e.innerHTML='<div class="u-f149db2"><svg width="28" height="28" viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg" class="u-37b1aa0 d-block"><path d="M6 9V27C6 29.5 11.5 31.5 18 31.5S30 29.5 30 27V9C30 11.5 24.5 13.5 18 13.5S6 11.5 6 9Z" fill="var(--accent)" fill-opacity="0.12" stroke="var(--accent)" stroke-width="1.7" stroke-linejoin="round" stroke-linecap="round"/><path d="M6 9C6 6.5 11.5 4.5 18 4.5S30 6.5 30 9 24.5 13.5 18 13.5 6 11.5 6 9Z" fill="var(--accent-gold)" fill-opacity="0.35" stroke="var(--accent)" stroke-width="1.7" stroke-linejoin="round" stroke-linecap="round"/><path d="M6 18C6 20.5 11.5 22.5 18 22.5S30 20.5 30 18" stroke="var(--accent)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" fill="none" opacity="0.85"/><circle cx="25" cy="27.2" r="1.2" fill="var(--accent-gold)"/><circle cx="21.5" cy="28" r="1.2" fill="var(--accent-gold)" opacity="0.6"/></svg>Loading database structure\u2026</div>';var i=window._showDeltaSyncDetails||window.showDeltaSyncDetails;if(!i){e.innerHTML='<div class="u-6925a24">Requires an active Firestore connection.</div>';return}var r=document.body.appendChild.bind(document.body),t=null;document.body.appendChild=function(n){return n&&n.id==="delta-stats-modal"&&(document.body.appendChild=r,n.style.cssText="display:none!important;position:fixed;",t=n),r(n)};try{if(await i(),t){var o=t.querySelector("#dbv-root");if(o)e.innerHTML="",e.appendChild(o);else{var c=t.firstElementChild;c?e.innerHTML=c.innerHTML:e.innerHTML='<div class="u-7b768c8">No content returned.</div>'}t.remove()}else e.innerHTML='<div class="u-5147c88"><svg width="36" height="36" viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg" class="u-37b1aa0 d-block"><path d="M18 3.5L30 8V18C30 25.5 24.5 30.5 18 33C11.5 30.5 6 25.5 6 18V8Z" fill="var(--accent)" fill-opacity="0.14" stroke="var(--accent)" stroke-width="1.7" stroke-linejoin="round" stroke-linecap="round"/><rect x="12.7" y="16.8" width="10.6" height="8.6" rx="2.2" fill="var(--accent-gold)" fill-opacity="0.32" stroke="var(--accent-gold)" stroke-width="1.6" stroke-linejoin="round"/><path d="M15 16.8V14.7A3 3 0 0 1 21 14.7V16.8" stroke="var(--accent-gold)" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" fill="none"/><circle cx="18" cy="21" r="1.2" fill="var(--accent-gold)"/></svg><div class="u-eb5b1c6">Sign in required</div><div class="u-988bc30">Database structure requires an active Firestore connection.</div></div>'}catch(n){document.body.appendChild=r,e.innerHTML='<div class="u-fc77210">Error: '+(n.message||"Unknown error")+"</div>",t&&t.remove()}setTimeout(function(){document.body.appendChild=r},2e3)}};var a=`<div id="db-structure-screen" class="standalone-screen d-none">
  <div class="shell-bar screen-topbar">
    <h2 class="screen-title">Database Structure</h2>
    <button onclick="loadDbStructureScreen()" title="Refresh" class="btn btn-theme btn-icon hv-refresh">
      <svg width="14" height="14" viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg"><g class="ic-sync-arrows"><path d="M30.5 15.5A12.8 12.8 0 0 0 8.2 10" stroke="var(--accent)" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" fill="none"/><path d="M8 4.8V10.4H13.6" stroke="var(--accent)" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" fill="none"/><path d="M5.5 20.5A12.8 12.8 0 0 0 27.8 26" stroke="var(--accent)" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" fill="none"/><path d="M28 31.2V25.6H22.4" stroke="var(--accent)" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" fill="none"/></g><circle cx="18" cy="18" r="3.6" fill="var(--accent-gold)" fill-opacity="0.35" stroke="var(--accent-gold)" stroke-width="1.5"/><circle cx="18" cy="18" r="1.2" fill="var(--accent-gold)"/></svg>
    </button>
  </div>
  <div class="screen-body">
    <div id="delta-sync-details-container" class="u-0fedcf9">
      <div class="u-5147c88">
        <svg width="40" height="40" viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg" class="u-5beb8fb"><path d="M6 9V27C6 29.5 11.5 31.5 18 31.5S30 29.5 30 27V9C30 11.5 24.5 13.5 18 13.5S6 11.5 6 9Z" fill="var(--accent)" fill-opacity="0.12" stroke="var(--accent)" stroke-width="1.7" stroke-linejoin="round" stroke-linecap="round"/><path d="M6 9C6 6.5 11.5 4.5 18 4.5S30 6.5 30 9 24.5 13.5 18 13.5 6 11.5 6 9Z" fill="var(--accent-gold)" fill-opacity="0.35" stroke="var(--accent)" stroke-width="1.7" stroke-linejoin="round" stroke-linecap="round"/><path d="M6 18C6 20.5 11.5 22.5 18 22.5S30 20.5 30 18" stroke="var(--accent)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" fill="none" opacity="0.85"/><circle cx="25" cy="27.2" r="1.2" fill="var(--accent-gold)"/><circle cx="21.5" cy="28" r="1.2" fill="var(--accent-gold)" opacity="0.6"/></svg>
        <div class="u-0af219e">Loading database structure\u2026</div>
      </div>
    </div>
  </div>
</div>`,d=`
#db-structure-screen #delta-sync-details-container {
  padding: 0;
}

#db-structure-screen #dbv-root {
  border-radius: 0;
  background: transparent;
}

#db-structure-screen #dbv-root > div:nth-child(2) {
  position: sticky;
  top: 0;
  z-index: 10;
  background: var(--bg-gradient, var(--bg));
  padding: 10px 0 10px;
  margin: 0 0 4px;
  border-bottom: 1px solid var(--glass-border);
}

#db-structure-screen #dbv-body {
  padding: 0;
}

#db-structure-screen #dbv-root { overflow: visible; }

#db-structure-screen #dbv-body { overflow: visible; flex: none; min-height: 0; }

#db-structure-screen #dbv-root { max-height: none; }

#db-structure-screen #dbv-body { max-height: none; }

`;export{d as __screenCss,a as __screenHtml};
