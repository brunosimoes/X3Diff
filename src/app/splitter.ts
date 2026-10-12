const KEY = 'x3diff-workbench-side';
const NARROWEST = 220;
/** The stage never gets narrower than this, however far the divider is dragged. */
const STAGE_NARROWEST = 280;

/**
 * Let the reviewer set the width of the side panel: drag the divider, use the arrow keys on
 * it, or double-click it to go back to the default. The width is kept for the next visit.
 */
export function resizableSide(workspace: HTMLElement, splitter: HTMLElement, side: HTMLElement) {
  const set = (width?: number) => {
    if (width === undefined) workspace.style.removeProperty('--side');
    else {
      const widest = Math.max(NARROWEST, workspace.clientWidth - STAGE_NARROWEST);
      const clamped = Math.round(Math.min(widest, Math.max(NARROWEST, width)));
      workspace.style.setProperty('--side', `${clamped}px`);
    }
    splitter.setAttribute('aria-valuemin', String(NARROWEST));
    splitter.setAttribute(
      'aria-valuemax',
      String(Math.max(NARROWEST, workspace.clientWidth - STAGE_NARROWEST)),
    );
    splitter.setAttribute('aria-valuenow', String(side.offsetWidth));
    try {
      if (width === undefined) localStorage.removeItem(KEY);
      else localStorage.setItem(KEY, workspace.style.getPropertyValue('--side'));
    } catch {
      /* The width still applies for this visit. */
    }
  };
  try {
    const saved = parseFloat(localStorage.getItem(KEY) ?? '');
    if (Number.isFinite(saved)) set(saved);
  } catch {
    /* Optional storage. */
  }
  splitter.addEventListener('pointerdown', (event) => {
    event.preventDefault();
    try {
      splitter.setPointerCapture(event.pointerId);
    } catch {
      /* Without capture the drag still follows the pointer over the divider. */
    }
    splitter.classList.add('dragging');
    const move = (e: PointerEvent) => set(workspace.getBoundingClientRect().right - e.clientX);
    const stop = () => {
      splitter.classList.remove('dragging');
      splitter.removeEventListener('pointermove', move);
    };
    splitter.addEventListener('pointermove', move);
    splitter.addEventListener('pointerup', stop, { once: true });
    splitter.addEventListener('pointercancel', stop, { once: true });
  });
  splitter.addEventListener('dblclick', () => set());
  splitter.addEventListener('keydown', (event) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    set(side.offsetWidth + (event.key === 'ArrowLeft' ? 24 : -24));
  });
}
