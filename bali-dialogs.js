/* Shared keyboard/focus behavior for the existing cart and application dialogs. */
(() => {
  const panels = [...document.querySelectorAll('.modal, #cartSidebar')];
  let active = null;
  let returnFocus = null;
  const managed = new Set();
  const focusable = panel => [...panel.querySelectorAll(
    'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex="0"]'
  )].filter(node => !node.closest('[hidden], [inert]') && node.getClientRects().length);
  function sync() {
    const open = panels.filter(panel => panel.classList.contains('active'));
    const next = open.find(panel => panel.id === 'authModal') || open.at(-1) || null;
    if (!active && next) returnFocus = document.activeElement;
    for (const panel of panels) panel.setAttribute('aria-hidden', String(panel !== next));
    for (const node of managed) node.inert = false;
    managed.clear();
    if (next) {
      for (const node of document.body.children) {
        // Native <dialog> elements manage their own top-layer focus/inertness.
        // Keeping them inert made the privacy consent visible but impossible to click.
        if (node === next || node.id === 'overlay' || node.tagName === 'SCRIPT' ||
            node.tagName === 'DIALOG' || node.inert) continue;
        node.inert = true;
        managed.add(node);
      }
    }
    if (active === next) return;
    active = next;
    if (next) {
      next.tabIndex = -1;
      // Focus after the opening styles have been applied (the cart was hidden).
      let frames = 0;
      const focusWhenVisible = () => {
        if (active !== next || document.querySelector('dialog[open]')) return;
        const target = focusable(next)[0] || next;
        target.focus({preventScroll: true});
        if (!next.contains(document.activeElement) && frames++ < 30) requestAnimationFrame(focusWhenVisible);
      };
      requestAnimationFrame(focusWhenVisible);
    } else if (returnFocus?.isConnected && !returnFocus.closest('[hidden]')) {
      returnFocus.focus({preventScroll: true});
      returnFocus = null;
    }
  }
  const observer = new MutationObserver(sync);
  panels.forEach(panel => observer.observe(panel, {attributes: true, attributeFilter: ['class']}));
  document.addEventListener('keydown', event => {
    if (!active || document.querySelector('dialog[open]')) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      window.closeAllModals?.();
    } else if (event.key === 'Tab') {
      const nodes = focusable(active);
      const first = nodes[0] || active, last = nodes.at(-1) || active;
      if (event.shiftKey && (document.activeElement === first || document.activeElement === active)) {
        event.preventDefault(); last.focus();
      } else if (!event.shiftKey && (document.activeElement === last || document.activeElement === active)) {
        event.preventDefault(); first.focus();
      }
    }
  });
  sync();
})();
