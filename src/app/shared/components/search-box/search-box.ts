import { Component, ElementRef, HostListener, inject, signal } from '@angular/core';
import { toObservable, takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import { catchError, debounceTime, distinctUntilChanged, of, switchMap } from 'rxjs';
import { AutocompleteSuggestion } from '../../core/models/api.models';
import { AnimeApi } from '../../core/services/anime-api';

@Component({
  selector: 'app-search-box',
  templateUrl: './search-box.html',
  styleUrl: './search-box.scss',
})
export class SearchBox {
  private readonly api = inject(AnimeApi);
  private readonly router = inject(Router);
  private readonly host = inject(ElementRef<HTMLElement>);

  readonly query = signal('');
  readonly suggestions = signal<AutocompleteSuggestion[]>([]);
  readonly open = signal(false);

  constructor() {
    toObservable(this.query)
      .pipe(
        debounceTime(250),
        distinctUntilChanged(),
        switchMap(q => (q.trim() ? this.api.autocomplete(q.trim()).pipe(catchError(() => of(null))) : of(null))),
        takeUntilDestroyed(),
      )
      .subscribe(res => {
        this.suggestions.set(res?.suggestions ?? []);
        this.open.set(!!res?.suggestions.length);
      });
  }

  onInput(event: Event): void {
    this.query.set((event.target as HTMLInputElement).value);
  }

  submit(): void {
    const q = this.query().trim();
    this.open.set(false);
    if (q) this.router.navigate(['/'], { queryParams: { q } });
  }

  pick(s: AutocompleteSuggestion): void {
    this.open.set(false);
    this.router.navigate(['/anime', s.id]);
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    if (!this.host.nativeElement.contains(event.target as Node)) this.open.set(false);
  }
}
