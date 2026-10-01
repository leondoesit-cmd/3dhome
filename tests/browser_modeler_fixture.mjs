// Test-only read access to the editor's actual tab-owned persistence contract.
// localStorage holds an IndexedDB pointer, not necessarily the full document.
export async function installModelerDraftFixture(page) {
  await page.eval(async()=>{
    const {modelerDraftOwner,readModelerDraft}=await import('/js/modeler_draft.js');
    const {loadModelerDraftRecord}=await import('/js/core/model_library_store.js');
    window.currentModelerDraftForTest=async()=>{
      const owner=modelerDraftOwner(sessionStorage);
      return await loadModelerDraftRecord(owner) || readModelerDraft(localStorage,owner);
    };
  });
}

// Shared drafts from older releases require an explicit Library recovery action.
// Owned drafts still prompt automatically when this same tab reloads.
export async function recoverLegacyModelerDraftFixture(page) {
  await page.eval(()=>document.querySelector('[data-tab="lib"]').click());
  await page.waitUntil(()=>[...document.querySelectorAll('#mdLib button')].some(button=>button.textContent.trim()==='Recover earlier draft'&&!button.hidden));
  await page.eval(()=>[...document.querySelectorAll('#mdLib button')].find(button=>button.textContent.trim()==='Recover earlier draft').click());
}
