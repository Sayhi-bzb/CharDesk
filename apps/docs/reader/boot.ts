function startManualBoot() {
  const root = document.documentElement;
  root.dataset.manualBoot = 'loading';
  const fallback = () => {
    if (root.dataset.manualBoot === 'loading') root.dataset.manualBoot = 'fallback';
  };
  window.setTimeout(fallback, 6000);
  window.addEventListener('error', event => {
    if (event.target instanceof HTMLScriptElement) fallback();
  }, true);
  window.addEventListener('unhandledrejection', fallback, { once: true });
}

export const manualBootScript = `(${startManualBoot.toString()})()`;
export const manualBootStyles = `
.manual-loading{display:none}
html[data-manual-boot="loading"] .manual-loading{display:block}
html[data-manual-boot="loading"] .manual-fallback{display:none}
html[data-manual-boot="loading"] [data-manual-cell-ui]{visibility:hidden}
html[data-manual-boot="fallback"] [data-manual-cell-ui]{display:none}
html[data-manual-boot="fallback"] .manual-fallback{display:block}
`;

export function completeManualBoot() {
  const root = document.documentElement;
  if (root.dataset.manualBoot === 'fallback') return false;
  root.dataset.manualBoot = 'ready';
  return true;
}

export function revealManualFallback() {
  document.documentElement.dataset.manualBoot = 'fallback';
}
