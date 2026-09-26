(() => {
  const { pathname, search, hash } = window.location;
  const shared = new URLSearchParams(hash.slice(1));
  const legacyCanvasPath = pathname === '/blackboard' || pathname.startsWith('/s/');
  const legacyShare =
    pathname === '/' &&
    (shared.has('room') ||
      shared.has('r') ||
      new URLSearchParams(search).has('room') ||
      new URLSearchParams(search).has('r'));
  if (!legacyCanvasPath && !legacyShare) return;
  window.location.replace(`https://canvas.chardesk.com${pathname}${search}${hash}`);
})();
