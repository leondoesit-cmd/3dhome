// Only explicit extension origins are excluded from application error UI.
// Do not match arbitrary message text or deeper callers: application failures
// invoked by an extension must still be reported. Native console reporting stays on.
export function isExtensionOriginError(event) {
  const filename=event?.filename;
  if(typeof filename==='string' && filename)return /^(?:chrome|moz|safari-web)-extension:\/\//i.test(filename);
  const error=event?.error || event?.reason;
  const stack=typeof error?.stack==='string'?error.stack:'';
  const firstFrame=stack.split('\n').find(line=>/^\s*at\s/.test(line)||/^[^\s]*@(?:[a-z][a-z0-9+.-]*):\/\//i.test(line));
  if(!firstFrame)return false;
  return /^\s*(?:at\s+(?:[^()]*?\s+\()?|[^\s]*@)(?:chrome|moz|safari-web)-extension:\/\//i.test(firstFrame);
}
