import { Injectable, signal } from '@angular/core';
import { readStored, writeStored } from './storage';

export type ThemeChoice = 'system' | 'light' | 'dark';

@Injectable({ providedIn: 'root' })
export class ThemeService {
  readonly choice = signal<ThemeChoice>(readStored<ThemeChoice>('norte.theme', 'system'));

  constructor() {
    this.apply(this.choice());
  }

  cycle(): void {
    const order: ThemeChoice[] = ['system', 'light', 'dark'];
    const next = order[(order.indexOf(this.choice()) + 1) % order.length]!;
    this.choice.set(next);
    writeStored('norte.theme', next);
    this.apply(next);
  }

  private apply(choice: ThemeChoice): void {
    const root = globalThis.document?.documentElement;
    if (!root) return;
    if (choice === 'system') delete root.dataset['theme'];
    else root.dataset['theme'] = choice;
  }
}
