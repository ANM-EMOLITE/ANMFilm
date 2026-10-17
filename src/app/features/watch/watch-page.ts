import { Component, computed, effect, inject, input, linkedSignal, signal, untracked, viewChild } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { UserAuth } from '@core/auth/user-auth';
import { UserApi } from '@core/services/user-api';
import { formatLabel, pickDescription, seasonLabel, statusLabel } from '@core/utils/media.utils';
import { VideoPlayer } from '@shared/components/video-player/video-player';
import { DropdownOption, ToastService, UiBadge, UiButton, UiDropdown, UiEmptyState, UiIcon, UiScrollArea, UiSkeleton, UiSpinner } from '@shared/ui';
import { WatchStore, sameEpisode } from './watch-store';

/** Danh sách tập dài thì chia nhóm (1–100, 101–200…). */
const RANGE_SIZE = 100;

@Component({
  selector: 'app-watch-page',
  imports: [RouterLink, VideoPlayer, UiBadge, UiButton, UiDropdown, UiEmptyState, UiIcon, UiScrollArea, UiSkeleton, UiSpinner],
  providers: [WatchStore],
  templateUrl: './watch-page.html',
  styleUrl: './watch-page.scss',
})
export class WatchPage {
  protected readonly store = inject(WatchStore);
  private readonly router = inject(Router);
  protected readonly auth = inject(UserAuth);
  private readonly userApi = inject(UserApi);
  private readonly toast = inject(ToastService);

  /** Route param :id và query ?ep= (withComponentInputBinding). */
  readonly id = input.required<string>();
  readonly ep = input<string>();

  // ---------- Thư viện người xem ----------
  private readonly savedIds = signal<Set<number>>(new Set());
  protected readonly saving = signal(false);
  protected readonly saved = computed(() => this.savedIds().has(this.animeId()));
  private readonly recorded = new Set<string>();

  private animeId(): number {
    return Number(this.id());
  }

  private cover(): string | null {
    const images = this.store.media()?.images;
    return images?.coverLg || images?.coverXl || images?.bannerUrl || null;
  }

  protected readonly player = viewChild(VideoPlayer);
  private readonly episodeScroll = viewChild<UiScrollArea>('episodeScroll');

  protected readonly descExpanded = signal(false);
  protected readonly episodeQuery = signal('');

  // ---------- Thông tin phim ----------
  protected readonly description = computed(() => pickDescription(this.store.media()?.descriptions));
  protected readonly backdrop = computed(() => {
    const images = this.store.media()?.images;
    return images?.bannerUrl || images?.coverXl || images?.coverLg || '';
  });
  protected readonly facts = computed(() => {
    const m = this.store.media();
    if (!m) return [];
    return [
      { label: 'Định dạng', value: formatLabel(m.format) },
      { label: 'Trạng thái', value: statusLabel(m.status) },
      { label: 'Mùa', value: m.season ? `${seasonLabel(m.season)} ${m.seasonYear ?? ''}` : '' },
      { label: 'Số tập', value: m.totalUnits ? `${m.totalUnits}` : '' },
      { label: 'Thời lượng', value: m.unitDurationMin ? `${m.unitDurationMin} phút/tập` : '' },
      { label: 'Studio', value: (m.studios ?? []).filter(s => s.isAnimationStudio).map(s => s.name).join(', ') },
    ].filter(f => f.value);
  });

  // ---------- Danh sách tập ----------
  protected readonly ranges = computed<DropdownOption<number>[]>(() => {
    const count = this.store.episodes().length;
    if (count <= RANGE_SIZE) return [];
    const eps = this.store.episodes();
    return Array.from({ length: Math.ceil(count / RANGE_SIZE) }, (_, i) => {
      const from = eps[i * RANGE_SIZE].episodeNumber;
      const to = eps[Math.min(count, (i + 1) * RANGE_SIZE) - 1].episodeNumber;
      return { value: i, label: `Tập ${from} – ${to}` };
    });
  });

  /** Tự nhảy tới nhóm chứa tập đang xem; người dùng vẫn đổi tay được. */
  protected readonly range = linkedSignal(() => Math.max(0, Math.floor(this.store.episodeIndex() / RANGE_SIZE)));

  protected readonly visibleEpisodes = computed(() => {
    const q = this.episodeQuery().trim();
    const eps = this.store.episodes();
    if (q) return eps.filter(e => e.episodeNumber.includes(q));
    return this.ranges().length ? eps.slice(this.range() * RANGE_SIZE, (this.range() + 1) * RANGE_SIZE) : eps;
  });

  constructor() {
    // Đổi :id → tải lại toàn bộ.
    effect(() => {
      const id = this.id();
      untracked(() => {
        this.episodeQuery.set('');
        this.descExpanded.set(false);
        void this.store.load(id, this.ep());
      });
    });

    // Đồng bộ tập đang xem lên URL (?ep=) để F5 / chia sẻ link vẫn đúng tập.
    effect(() => {
      const ep = this.store.episodeNumber();
      if (!ep || sameEpisode(ep, untracked(this.ep))) return;
      untracked(() =>
        this.router.navigate([], { queryParams: { ep }, queryParamsHandling: 'merge', replaceUrl: true }),
      );
    });

    // Cuộn tới tập đang xem trong danh sách.
    effect(() => {
      this.store.episodeNumber();
      this.visibleEpisodes();
      queueMicrotask(() => {
        const el = document.querySelector<HTMLElement>('.ep.active');
        if (el) this.episodeScroll()?.scrollIntoView(el);
      });
    });

    // Nạp danh sách phim đã lưu để hiện trạng thái nút "Lưu".
    if (this.auth.isLoggedIn()) {
      this.userApi.watchlistIds().subscribe({
        next: ids => this.savedIds.set(new Set(ids)),
        error: () => {},
      });
    }

    // Ghi nhận lịch sử xem khi tập bắt đầu phát (mỗi tập chỉ ghi 1 lần/phiên).
    effect(() => {
      const phase = this.store.phase();
      const ep = this.store.episodeNumber();
      if (phase !== 'playing' || !ep || !this.auth.isLoggedIn()) return;

      const key = `${this.animeId()}|${ep}`;
      if (this.recorded.has(key)) return;
      this.recorded.add(key);

      untracked(() =>
        this.userApi
          .recordWatch({
            animeId: this.animeId(),
            episode: Number.isFinite(Number(ep)) ? Number(ep) : null,
            title: this.store.title(),
            cover: this.cover(),
          })
          .subscribe({ error: () => this.recorded.delete(key) }),
      );
    });
  }

  /** Lưu / bỏ lưu phim hiện tại. Chưa đăng nhập → chuyển tới trang đăng nhập. */
  protected toggleSave(): void {
    if (!this.auth.isLoggedIn()) {
      void this.router.navigate(['/login'], { queryParams: { returnUrl: this.router.url } });
      return;
    }
    if (this.saving()) return;

    const id = this.animeId();
    this.saving.set(true);

    if (this.saved()) {
      this.userApi.removeWatchlist(id).subscribe({
        next: () => {
          this.saving.set(false);
          this.savedIds.update(set => {
            const next = new Set(set);
            next.delete(id);
            return next;
          });
        },
        error: (message: string) => {
          this.saving.set(false);
          this.toast.show('danger', 'Không bỏ lưu được', message);
        },
      });
    } else {
      this.userApi.addWatchlist({ animeId: id, title: this.store.title(), cover: this.cover() }).subscribe({
        next: () => {
          this.saving.set(false);
          this.savedIds.update(set => new Set(set).add(id));
          this.toast.show('success', 'Đã lưu', 'Phim đã được thêm vào danh sách của bạn.');
        },
        error: (message: string) => {
          this.saving.set(false);
          this.toast.show('danger', 'Không lưu được', message);
        },
      });
    }
  }

  protected play(episodeNumber: string): void {
    void this.store.play(episodeNumber);
    if (window.innerWidth < 1024) window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  protected playFirst(): void {
    const first = this.store.episodes()[0];
    if (first) this.play(first.episodeNumber);
  }

  protected onPlayerError(message: string): void {
    this.store.onPlayerError(message, this.player()?.currentTime() ?? 0);
  }

  protected isCurrent(episodeNumber: string): boolean {
    return sameEpisode(episodeNumber, this.store.episodeNumber());
  }

  protected onEpisodeQuery(event: Event): void {
    this.episodeQuery.set((event.target as HTMLInputElement).value);
  }
}

