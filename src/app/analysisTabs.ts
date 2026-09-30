/** A small local registry: modules own their data and rendering; the shell owns navigation. */
export interface AnalysisTab {
  id: string;
  label: string;
  description: string;
  panel: HTMLElement;
  available: () => boolean;
  required?: boolean;
  activate?: () => void | Promise<void>;
  deactivate?: () => void;
}

type Preferences = { active: string; order: string[]; hidden: string[] };
const storageKey = 'x3diff-analysis-tabs';
export function parseTabPreferences(value: string | null): Preferences {
  try {
    const saved = JSON.parse(value ?? '{}');
    const ids = (v: unknown): string[] =>
      Array.isArray(v)
        ? [
            ...new Set(
              v.filter(
                (id): id is string => typeof id === 'string' && /^[a-z][a-z0-9-]{0,63}$/.test(id),
              ),
            ),
          ].slice(0, 64)
        : [];
    return {
      active: typeof saved?.active === 'string' ? saved.active : 'differences',
      order: ids(saved?.order),
      hidden: ids(saved?.hidden),
    };
  } catch {
    return { active: 'differences', order: [], hidden: [] };
  }
}

export class AnalysisTabs {
  private tabs: AnalysisTab[] = [];
  private preferences: Preferences;
  private selected?: AnalysisTab;
  private revision = 0;
  private list: HTMLElement;
  private settings: HTMLElement;
  private error: HTMLElement;
  private customize: HTMLButtonElement;

  constructor(
    private host: HTMLElement,
    heading: HTMLElement,
  ) {
    let saved: string | null = null;
    try {
      saved = localStorage.getItem(storageKey);
    } catch {
      /* Optional storage. */
    }
    this.preferences = parseTabPreferences(saved);
    heading.innerHTML = `<div class="analysis-tabbar"><div class="analysis-tablist" role="tablist" aria-label="Analysis views"></div><button type="button" id="analysis-customize" class="button quiet" aria-expanded="false" aria-controls="analysis-options">Customize</button></div><div id="analysis-options" class="analysis-options" hidden><p>Choose which views to show and their order. Your last view is remembered.</p><div class="analysis-option-list"></div><button type="button" class="button quiet" id="analysis-reset">Reset tabs</button></div><p class="analysis-error" role="status" hidden></p>`;
    this.list = heading.querySelector('.analysis-tablist')!;
    this.settings = heading.querySelector('#analysis-options')!;
    this.error = heading.querySelector('.analysis-error')!;
    this.customize = heading.querySelector('#analysis-customize')!;
    this.customize.addEventListener('click', () => {
      this.settings.hidden = !this.settings.hidden;
      this.customize.setAttribute('aria-expanded', String(!this.settings.hidden));
      if (!this.settings.hidden) this.renderOptions();
    });
    this.settings.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        this.settings.hidden = true;
        this.customize.setAttribute('aria-expanded', 'false');
        this.customize.focus();
      }
    });
    heading.querySelector('#analysis-reset')!.addEventListener('click', () => {
      this.preferences = parseTabPreferences(null);
      this.save();
      this.refresh();
      this.customize.focus();
    });
    this.list.addEventListener('keydown', (event) => {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
      const buttons = Array.from(this.list.querySelectorAll<HTMLButtonElement>('[role=tab]'));
      const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
      if (index < 0) return;
      event.preventDefault();
      const next =
        event.key === 'Home'
          ? 0
          : event.key === 'End'
            ? buttons.length - 1
            : (index + (event.key === 'ArrowRight' ? 1 : -1) + buttons.length) % buttons.length;
      buttons[next].click();
      buttons[next].focus();
    });
  }

  register(tab: AnalysisTab) {
    if (!/^[a-z][a-z0-9-]{0,63}$/.test(tab.id) || this.tabs.some((item) => item.id === tab.id))
      throw new Error('Analysis tab IDs must be unique lowercase identifiers.');
    tab.panel.id ||= `analysis-panel-${tab.id}`;
    tab.panel.setAttribute('role', 'tabpanel');
    tab.panel.setAttribute('aria-labelledby', `analysis-tab-${tab.id}`);
    tab.panel.tabIndex = 0;
    tab.panel.hidden = true;
    this.tabs.push(tab);
  }

  private ordered(): AnalysisTab[] {
    const order = [...this.preferences.order, ...this.tabs.map((tab) => tab.id)];
    return [...this.tabs].sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
  }

  refresh() {
    const available = this.ordered().filter((tab) => tab.available());
    const visible = available.filter(
      (tab) => tab.required || !this.preferences.hidden.includes(tab.id),
    );
    this.host.hidden = visible.length === 0;
    this.list.replaceChildren(
      ...visible.map((tab) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.id = `analysis-tab-${tab.id}`;
        button.setAttribute('role', 'tab');
        button.setAttribute('aria-controls', tab.panel.id);
        button.title = tab.description;
        button.textContent = tab.label;
        button.addEventListener('click', () => {
          this.preferences.active = tab.id;
          this.save();
          this.select(tab);
        });
        return button;
      }),
    );
    this.select(visible.find((tab) => tab.id === this.preferences.active) ?? visible[0]);
    if (!this.settings.hidden) this.renderOptions();
  }

  clear() {
    this.select(undefined);
    this.host.hidden = true;
    this.list.replaceChildren();
    this.settings.hidden = true;
    this.customize.setAttribute('aria-expanded', 'false');
  }

  private select(tab?: AnalysisTab) {
    const changed = this.selected !== tab;
    const ticket = changed ? ++this.revision : this.revision;
    if (changed) {
      try {
        this.selected?.deactivate?.();
      } catch {
        /* A departing module cannot block navigation. */
      }
    }
    this.selected = tab;
    for (const item of this.tabs) {
      item.panel.hidden = item !== tab;
      const button = this.list.querySelector<HTMLButtonElement>(`#analysis-tab-${item.id}`);
      if (button) {
        button.setAttribute('aria-selected', String(item === tab));
        button.tabIndex = item === tab ? 0 : -1;
      }
    }
    if (changed) this.error.hidden = true;
    if (tab && changed) {
      const fail = (error: unknown) => {
        if (ticket !== this.revision) return;
        this.error.textContent = `${tab.label} could not open. ${error instanceof Error ? error.message : 'Try another view or compare again.'}`;
        this.error.hidden = false;
      };
      try {
        Promise.resolve(tab.activate?.()).catch(fail);
      } catch (error) {
        fail(error);
      }
    }
  }

  private renderOptions() {
    const options = this.settings.querySelector('.analysis-option-list')!;
    const tabs = this.ordered().filter((tab) => tab.available());
    options.replaceChildren(
      ...tabs.map((tab, index) => {
        const row = document.createElement('div');
        row.className = 'analysis-option';
        const label = document.createElement('label'),
          input = document.createElement('input');
        input.id = `analysis-option-${tab.id}`;
        input.type = 'checkbox';
        input.checked = !!tab.required || !this.preferences.hidden.includes(tab.id);
        input.disabled = !!tab.required;
        input.setAttribute('aria-label', `Show ${tab.label}`);
        input.addEventListener('change', () => {
          this.preferences.hidden = this.preferences.hidden.filter((id) => id !== tab.id);
          if (!input.checked) this.preferences.hidden.push(tab.id);
          this.save();
          this.refresh();
          this.settings.querySelector<HTMLInputElement>(`#analysis-option-${tab.id}`)?.focus();
        });
        label.append(
          input,
          document.createTextNode(tab.label + (tab.required ? ' · Always available' : '')),
        );
        row.append(label);
        for (const [direction, title, symbol] of [
          [-1, 'earlier', '↑'],
          [1, 'later', '↓'],
        ] as const) {
          const button = document.createElement('button');
          button.type = 'button';
          button.textContent = symbol;
          button.className = 'analysis-move';
          button.setAttribute('aria-label', `Move ${tab.label} ${title}`);
          button.disabled = index + direction < 0 || index + direction >= tabs.length;
          button.addEventListener('click', () => {
            const ids = this.ordered().map((item) => item.id),
              a = ids.indexOf(tab.id),
              b = ids.indexOf(tabs[index + direction].id);
            [ids[a], ids[b]] = [ids[b], ids[a]];
            this.preferences.order = ids;
            this.save();
            this.refresh();
            this.customize.focus();
          });
          row.append(button);
        }
        return row;
      }),
    );
  }
  private save() {
    try {
      localStorage.setItem(storageKey, JSON.stringify(this.preferences));
    } catch {
      /* Works for this session without storage. */
    }
  }
}
