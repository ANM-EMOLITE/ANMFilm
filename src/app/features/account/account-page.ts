import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router, RouterLink } from '@angular/router';
import { Observable } from 'rxjs';
import { UserAuth } from '@core/auth/user-auth';
import { UserApi } from '@core/services/user-api';
import { WatchHistoryEntry, WatchlistItem } from '@core/models/user.models';
import { ToastService, UiButton, UiEmptyState, UiIcon, UiSpinner } from '@shared/ui';

type Tab = 'watchlist' | 'history';

@Component({
  selector: 'app-account-page',
  imports: [DatePipe, RouterLink, UiButton, UiEmptyState, UiIcon, UiSpinner],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="container acc">
      <header class="acc-head">
        <div>
          <h1>Xin chào, {{ displayName() }}</h1>
          <p class="text-muted">{{ user()?.email }}</p>
        </div>
        <button uiBtn variant="secondary" size="sm" (click)="logout()"><ui-icon name="logout" [size]="14" /> Đăng xuất</button>
      </header>

      <nav class="tabs">
        <button class="tab" [class.on]="tab() === 'watchlist'" (click)="go('watchlist')"><ui-icon name="list" [size]="15" /> Phim đã lưu</button>
        <button class="tab" [class.on]="tab() === 'history'" (click)="go('history')"><ui-icon name="clock" [size]="15" /> Lịch sử xem</button>
      </nav>

      @if (loading()) {
        <div class="center"><ui-spinner [size]="22" /></div>
      } @else if (error()) {
        <ui-empty-state icon="alert" tone="danger" heading="Không tải được" [message]="error()">
          <button uiBtn (click)="load()"><ui-icon name="refresh" [size]="16" /> Thử lại</button>
        </ui-empty-state>
      } @else {
        @switch (tab()) {
          @case ('watchlist') {
            @if (watchlist().length) {
              <div class="grid">
                @for (it of watchlist(); track it.animeId) {
                  <article class="card-item">
                    <a class="poster" [routerLink]="['/anime', it.animeId]">
                      @if (it.cover) { <img [src]="it.cover" [alt]="it.title ?? ''" loading="lazy" /> }
                      @else { <span class="ph"><ui-icon name="film" [size]="22" /></span> }
                    </a>
                    <a class="t" [routerLink]="['/anime', it.animeId]">{{ it.title ?? ('Phim #' + it.animeId) }}</a>
                    <div class="row">
                      <small class="text-muted">{{ it.addedAt | date: 'dd/MM/yyyy' }}</small>
                      <button class="rm" title="Bỏ lưu" (click)="remove(it.animeId)"><ui-icon name="x" [size]="14" /></button>
                    </div>
                  </article>
                }
              </div>
            } @else {
              <ui-empty-state icon="list" heading="Chưa lưu phim nào" message="Mở một phim và bấm “Lưu” để xem lại sau." />
            }
          }
          @case ('history') {
            @if (history().length) {
              <div class="grid">
                @for (it of history(); track it.animeId) {
                  <article class="card-item">
                    <a class="poster" [routerLink]="['/anime', it.animeId]">
                      @if (it.cover) { <img [src]="it.cover" [alt]="it.title ?? ''" loading="lazy" /> }
                      @else { <span class="ph"><ui-icon name="film" [size]="22" /></span> }
                    </a>
                    <a class="t" [routerLink]="['/anime', it.animeId]">{{ it.title ?? ('Phim #' + it.animeId) }}</a>
                    <div class="row">
                      <small class="text-muted">
                        @if (it.episode) { Tập {{ it.episode }} · } {{ it.watchedAt | date: 'HH:mm dd/MM' }}
                      </small>
                    </div>
                  </article>
                }
              </div>
            } @else {
              <ui-empty-state icon="clock" heading="Chưa có lịch sử xem" message="Lịch sử sẽ hiện ở đây khi bạn xem phim." />
            }
          }
        }
      }
    </section>
  `,
  styles: `
    .acc { padding: 32px 0 64px; display: grid; gap: 20px; }
    .acc-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; flex-wrap: wrap; }
    h1 { font-size: 22px; font-weight: 700; }
    .tabs { display: flex; gap: 6px; flex-wrap: wrap; border-bottom: 1px solid var(--border); }
    .tab {
      display: inline-flex; align-items: center; gap: 7px; padding: 10px 14px; border: 0; background: none;
      color: var(--muted); font-size: 14px; font-weight: 600; cursor: pointer; border-bottom: 2px solid transparent;
      &:hover { color: var(--text); }
      &.on { color: var(--accent); border-bottom-color: var(--accent); }
    }
    .center { display: grid; place-items: center; padding: 60px 0; }
    .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 16px; }
    .card-item { display: grid; gap: 8px; }
    .poster {
      display: block; aspect-ratio: 2/3; border-radius: var(--radius); overflow: hidden; background: var(--surface-3);
      img { width: 100%; height: 100%; object-fit: cover; }
      .ph { display: grid; place-items: center; height: 100%; color: var(--muted); }
    }
    .t { font-size: 13.5px; font-weight: 600; line-height: 1.35; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
    .t:hover { color: var(--accent); }
    .row { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
    .rm {
      display: grid; place-items: center; width: 26px; height: 26px; border: 0; border-radius: 6px;
      background: var(--surface-3); color: var(--muted); cursor: pointer;
      &:hover { color: var(--danger); background: var(--danger-soft); }
    }
    .logs { display: grid; gap: 2px; }
    .logs li {
      display: flex; align-items: center; gap: 8px; padding: 11px 12px; border-radius: var(--radius-sm);
      font-size: 13.5px; &:nth-child(odd) { background: var(--surface-2); }
    }
  `,
})
export class AccountPage {
  private readonly api = inject(UserApi);
  private readonly auth = inject(UserAuth);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly user = this.auth.user;
  protected readonly displayName = computed(() => this.user()?.displayName || this.user()?.username || 'bạn');

  protected readonly tab = signal<Tab>('watchlist');
  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly watchlist = signal<WatchlistItem[]>([]);
  protected readonly history = signal<WatchHistoryEntry[]>([]);

  constructor() {
    this.load();
  }

  protected go(tab: Tab): void {
    if (this.tab() === tab) return;
    this.tab.set(tab);
    this.load();
  }

  protected load(): void {
    this.loading.set(true);
    this.error.set(null);
    const tab = this.tab();
    const source: Observable<WatchlistItem[] | WatchHistoryEntry[]> =
      tab === 'watchlist' ? this.api.watchlist() : this.api.history();

    source.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (data: WatchlistItem[] | WatchHistoryEntry[]) => {
        this.loading.set(false);
        if (tab === 'watchlist') this.watchlist.set(data as WatchlistItem[]);
        else this.history.set(data as WatchHistoryEntry[]);
      },
      error: (message: string) => {
        this.loading.set(false);
        this.error.set(message);
      },
    });
  }

  protected remove(animeId: number): void {
    this.api.removeWatchlist(animeId).subscribe({
      next: () => this.watchlist.update(list => list.filter(x => x.animeId !== animeId)),
      error: (message: string) => this.toast.show('danger', 'Không bỏ lưu được', message),
    });
  }

  protected logout(): void {
    this.auth.logout();
  }
}
