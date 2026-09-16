import { t } from './i18n.js';

// Browsers cannot confirm an anchor download finished. Keep a retryable link
// alive; preparing the export does not mark the project as locally saved.
export async function deliverExport(name, blob) {
  const dialog = document.createElement('dialog');
  dialog.className = 'export-delivery';
  const heading = document.createElement('h3');
  heading.textContent = t('workflow_export_ready');
  const info = document.createElement('p');
  info.textContent = name + ' · ' + Math.ceil(blob.size / 1024) + ' KB';
  const hint = document.createElement('p');
  hint.textContent = t('workflow_export_hint');
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);
  link.href = url; link.download = name;
  link.textContent = t('workflow_export_download');
  const close = document.createElement('button');
  close.textContent = t('close');
  close.onclick = () => dialog.close();
  dialog.append(heading, info, hint, link, close);
  dialog.addEventListener('close', () => { URL.revokeObjectURL(url); dialog.remove(); }, {once:true});
  document.body.append(dialog); dialog.showModal(); link.focus();
  return {ready:true};
}
