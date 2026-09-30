import { sanitizePreview } from './sanitize';

type X3DCanvas = HTMLElement & { browser?: any };
const xiteReady = import(
  /* @vite-ignore */ `${import.meta.env.BASE_URL}vendor/x_ite/x_ite.min.mjs`
);

export class X3DPane {
  readonly element: HTMLElement;
  private canvas: X3DCanvas;
  private wrap: HTMLElement;
  private label: string;
  private loadRevision = 0;
  private pendingLoad: Promise<void> = Promise.resolve();
  private pathToCue = new Map<string, string>();
  private activeCues: Array<{ field: any; value: boolean }> = [];
  private animationClocks: string[] = [];
  private animationsEnabled = true;
  private hasAuthoredView = false;
  private theme: 'light' | 'dark' = 'light';
  private backgroundName = '';
  constructor(label: string) {
    this.label = label;
    this.element = document.createElement('section');
    this.element.className = 'viewer-card';
    this.element.innerHTML = `<header><strong>${label}</strong><span class="viewer-state" role="status"></span></header><div class="canvas-wrap"></div><p class="preview-notice"></p>`;
    this.wrap = this.element.querySelector('.canvas-wrap')!;
    this.canvas = this.createCanvas();
    this.wrap.append(this.canvas);
  }
  private createCanvas(): X3DCanvas {
    const canvas = document.createElement('x3d-canvas') as X3DCanvas;
    canvas.setAttribute('contentScale', '1');
    canvas.setAttribute('splashScreen', 'false');
    canvas.setAttribute(
      'aria-label',
      `${this.label} X3D preview; use pointer controls to orbit and zoom`,
    );
    return canvas;
  }
  clear(message = ''): void {
    this.loadRevision++;
    this.clearCue();
    this.pathToCue.clear();
    this.animationClocks = [];
    // Keep one WebGL context per pane across comparisons. Serialize world changes
    // with imports so a cancelled load cannot replace a newer scene.
    this.pendingLoad = this.pendingLoad
      .catch(() => {})
      .then(async () => {
        const browser = this.canvas.browser;
        if (!browser) return;
        const previous = browser.currentScene;
        await browser.replaceWorld(null);
        if (previous !== browser.currentScene) previous?.dispose?.();
      })
      .catch(() => {
        /* A later load may recover from a renderer reset failure. */
      });
    this.element.querySelector<HTMLElement>('.viewer-state')!.textContent = message;
    this.element.querySelector<HTMLElement>('.preview-notice')!.textContent = '';
  }
  load(xml: string): Promise<void> {
    this.clearCue();
    const revision = ++this.loadRevision;
    this.pendingLoad = this.pendingLoad.catch(() => {}).then(() => this.loadNow(xml, revision));
    return this.pendingLoad;
  }
  private async loadNow(xml: string, revision: number): Promise<void> {
    if (revision !== this.loadRevision) return;
    const state = this.element.querySelector<HTMLElement>('.viewer-state')!;
    const note = this.element.querySelector<HTMLElement>('.preview-notice')!;
    state.textContent = 'Loading preview…';
    note.textContent = '';
    try {
      const safe = sanitizePreview(xml);
      this.pathToCue = safe.pathToCue;
      note.textContent = safe.notices.join(' ');
      await xiteReady;
      await customElements.whenDefined('x3d-canvas');
      if (revision !== this.loadRevision) return;
      const browser = await this.waitForBrowser();
      if (revision !== this.loadRevision) return;
      browser.setBrowserOption?.('LoadUrlObjects', false);
      const parsed = new DOMParser().parseFromString(safe.xml, 'application/xml');
      for (const bg of Array.from(parsed.getElementsByTagName('Background'))) bg.remove();
      this.backgroundName = 'X3DIFF_THEME_BACKGROUND';
      while (parsed.querySelector(`[DEF="${this.backgroundName}"]`)) this.backgroundName += '_';
      const background = parsed.createElement('Background');
      background.setAttribute('DEF', this.backgroundName);
      background.setAttribute('skyColor', this.theme === 'dark' ? '.055 .085 .12' : '.91 .94 .95');
      parsed.getElementsByTagName('Scene')[0].prepend(background);
      this.hasAuthoredView = parsed.getElementsByTagName('Viewpoint').length > 0;
      this.animationClocks = Array.from(parsed.getElementsByTagName('TimeSensor'))
        .map((n) => n.getAttribute('DEF'))
        .filter((n): n is string => !!n);
      const scene = await browser.importDocument(parsed);
      if (revision !== this.loadRevision) {
        scene.dispose?.();
        return;
      }
      const previous = browser.currentScene;
      try {
        await browser.replaceWorld(scene);
      } catch (error) {
        if (browser.currentScene !== scene) scene.dispose?.();
        throw error;
      } finally {
        if (previous !== browser.currentScene) previous?.dispose?.();
      }
      if (revision !== this.loadRevision) return;
      this.setAnimationEnabled(this.animationsEnabled);
      this.setTheme(this.theme);
      if (!parsed.getElementsByTagName('Viewpoint').length) browser.viewAll?.();
      await browser.nextFrame?.();
      if (revision !== this.loadRevision) return;
      const activeScene = browser.currentScene;
      if (!activeScene) throw new Error('X_ITE did not activate the imported scene.');
      state.textContent = '';
    } catch (error) {
      if (revision === this.loadRevision) {
        state.textContent = 'Preview unavailable';
        note.textContent =
          `${note.textContent} ${error instanceof Error ? error.message : 'Renderer failed.'}`.trim();
      }
    }
  }
  private async waitForBrowser(): Promise<any> {
    const deadline = Date.now() + 12000;
    while (Date.now() < deadline) {
      if (this.canvas.browser) return this.canvas.browser;
      await new Promise((resolve) => window.setTimeout(resolve, 100));
    }
    throw new Error('X_ITE browser did not initialize. Check WebGL support.');
  }
  refreshView(force = false): void {
    if ((force || !this.hasAuthoredView) && this.element.getBoundingClientRect().width > 0)
      this.canvas.browser?.viewAll?.();
  }
  setTheme(theme: 'light' | 'dark'): void {
    this.theme = theme;
    const scene = this.canvas.browser?.currentScene;
    if (!scene || !this.backgroundName) return;
    try {
      scene
        .getNamedNode(this.backgroundName)
        .getField('skyColor')
        .fromString(theme === 'dark' ? '.055 .085 .12' : '.91 .94 .95', scene);
    } catch {}
  }
  setAnimationEnabled(enabled: boolean): void {
    this.animationsEnabled = enabled;
    for (const name of this.animationClocks) {
      try {
        this.canvas.browser?.currentScene?.getNamedNode(name).getField('enabled').setValue(enabled);
      } catch {}
    }
  }
  setRegions(mode: string): void {
    const visible =
      mode === 'all'
        ? ['BEFORE_ONLY', 'SHARED', 'AFTER_ONLY']
        : mode === 'changes'
          ? ['BEFORE_ONLY', 'AFTER_ONLY', 'AFTER_CONTEXT']
          : mode === 'before'
            ? ['BEFORE_ONLY', 'BEFORE_CONTEXT']
            : mode === 'after'
              ? ['AFTER_ONLY', 'AFTER_CONTEXT']
              : ['SHARED'];
    for (const name of ['BEFORE_ONLY', 'SHARED', 'AFTER_ONLY', 'BEFORE_CONTEXT', 'AFTER_CONTEXT']) {
      try {
        this.canvas.browser?.currentScene
          ?.getNamedNode(`X3DIFF_${name}_VISIBILITY`)
          .getField('whichChoice')
          .setValue(visible.includes(name) ? 0 : -1);
      } catch {}
    }
  }
  clearCue(): void {
    for (const cue of this.activeCues)
      try {
        cue.field.setValue(cue.value);
      } catch {}
    this.activeCues = [];
  }
  /** BBox display identifies the current selection until another item is chosen. */
  cue(defName?: string, path?: string): boolean {
    return this.cueMany([{ defName, path }]);
  }
  cueMany(targets: Array<{ defName?: string; path?: string }>): boolean {
    this.clearCue();
    const scene = this.canvas.browser?.currentScene;
    if (!scene) return false;
    const names = new Set(
      targets
        .map(({ path }) => (path ? this.pathToCue.get(path) : undefined))
        .filter((name): name is string => !!name),
    );
    if (!names.size) for (const { defName } of targets) if (defName) names.add(defName);
    for (const name of names) {
      try {
        const bbox = scene.getNamedNode?.(name)?.getField?.('bboxDisplay');
        if (!bbox) continue;
        const value = !!bbox.getValue?.().valueOf?.();
        bbox.setValue(true);
        this.activeCues.push({ field: bbox, value });
      } catch {}
    }
    return this.activeCues.length > 0;
  }
}
