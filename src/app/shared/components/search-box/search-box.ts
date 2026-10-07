import { Component, ElementRef, inject, signal, viewChild } from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import { catchError, debounceTime, distinctUntilChanged, of, switchMap, tap } from 'rxjs';
import { AutocompleteSuggestion } from '@core/models/api.models';
import { AnimeApi } from '@core/services/anime-api';
import { UiIcon, UiSpinner } from '@shared/ui';

/** Ô tìm kiếm có gợi ý. Phím tắt: "/" hoặc Ctrl+K để focus. */
@Component({
  selector: 'app-search-box',
  imports: [UiIcon, UiSpinner],
  templateUrl: './search-box.html',
  styleUrl: './search-box.scss',
  host: {
    '(document:click)': 'onDocumentClick($event)',
    '(document:keydown)': 'onShortcut($event)',
  },
})
export class SearchBox {
  private readonly api = inject(AnimeApi);
  private readonly router = inject(Router);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly input = viewChild.required<ElementRef<HTMLInputElement>>('input');

  readonly query = signal('');
  readonly suggestions = signal<AutocompleteSuggestion[]>([]);
  readonly open = signal(false);
  readonly loading = signal(false);
  readonly activeIndex = signal(-1);

  constructor() {
    toObservable(this.query)
      .pipe(
        debounceTime(250),
        distinctUntilChanged(),
        tap(q => this.loading.set(!!q.trim())),
        switchMap(q => (q.trim() ? this.api.autocomplete(q.trim()).pipe(catchError(() => of(null))) : of(null))),
        takeUntilDestroyed(),
      )
      .subscribe(res => {
        this.loading.set(false);
        this.suggestions.set(res?.suggestions ?? []);
        this.activeIndex.set(-1);
        this.open.set(!!res?.suggestions.length);
      });
  }

  onInput(event: Event): void {
    this.query.set((event.target as HTMLInputElement).value);
  }

  clear(): void {
    this.query.set('');
    this.suggestions.set([]);
    this.open.set(false);
    this.input().nativeElement.focus();
  }

  submit(): void {
    const active = this.suggestions()[this.activeIndex()];
    if (this.open() && active) return this.pick(active);

    const q = this.query().trim();
    this.open.set(false);
    if (q) this.router.navigate(['/'], { queryParams: { q } });
  }

  pick(s: AutocompleteSuggestion): void {
    this.open.set(false);
    this.input().nativeElement.blur();
    this.router.navigate(['/anime', s.id]);
  }

  onKeydown(event: KeyboardEvent): void {
    const count = this.suggestions().length;
    if (event.key === 'Escape') {
      this.open.set(false);
    } else if ((event.key === 'ArrowDown' || event.key === 'ArrowUp') && count) {
      event.preventDefault();
      this.open.set(true);
      const step = event.key === 'ArrowDown' ? 1 : -1;
      // Vòng qua -1 (ô nhập) → 0..count-1 (gợi ý).
      this.activeIndex.update(i => ((i + 1 + step + count + 1) % (count + 1)) - 1);
    }
  }

  onDocumentClick(event: MouseEvent): void {
    if (!this.host.nativeElement.contains(event.target as Node)) this.open.set(false);
  }

  onShortcut(event: KeyboardEvent): void {
    const target = event.target as HTMLElement;
    const typing = target.closest('input, textarea, [contenteditable]');
    if ((event.key === '/' && !typing) || (event.key.toLowerCase() === 'k' && (event.ctrlKey || event.metaKey))) {
      event.preventDefault();
      this.input().nativeElement.focus();
    }
  }
}
