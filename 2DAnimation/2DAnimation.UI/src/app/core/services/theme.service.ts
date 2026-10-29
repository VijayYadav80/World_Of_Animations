import { Injectable, effect, signal } from '@angular/core';

export type Theme = 'dark' | 'light';
const KEY = 'woa.theme';

/** Dark / light theme. Remembered in the browser; dark is the default. */
@Injectable({ providedIn: 'root' })
export class ThemeService {
  readonly theme = signal<Theme>(this.initial());

  constructor() {
    effect(() => {
      const t = this.theme();
      document.documentElement.dataset['theme'] = t;
      try { localStorage.setItem(KEY, t); } catch { /* private mode: just do not remember it */ }
    });
  }

  toggle(): void {
    this.theme.update(t => (t === 'dark' ? 'light' : 'dark'));
  }

  private initial(): Theme {
    try {
      const saved = localStorage.getItem(KEY);
      if (saved === 'dark' || saved === 'light') return saved;
    } catch { /* ignore */ }
    return 'dark';
  }
}
