import { Component, DestroyRef, computed, effect, inject, input, linkedSignal, signal, untracked, viewChild } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { Router, RouterLink } from '@angular/router';
import { UserAuth } from '@core/auth/user-auth';
import { UserApi } from '@core/services/user-api';
import { formatLabel, pickDescription, seasonLabel, statusLabel } from '@core/utils/media.utils';
import { VideoPlayer } from '@shared/components/video-player/video-player';
import { DropdownOption, ToastService, UiBadge, UiButton, UiDropdown, UiEmptyState, UiIcon, UiScrollArea, UiSkeleton, UiSpinner } from '@shared/ui';
import { CommentsSection } from './comments/comments-section';
import { RelatedSection } from './related/related-section';
import { WatchStore, sameEpisode } from './watch-store';

/** Danh sách tập dài thì chia nhóm (1–100, 101–200…). */
const RANGE_SIZE = 100;

@Component({
  selector: 'app-watch-page',
  imports: [RouterLink, VideoPlayer, CommentsSection, RelatedSection, UiBadge, UiButton, UiDropdown, UiEmptyState, UiIcon, UiScrollArea, UiSkeleton, UiSpinner],
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
  private readonly titleService = inject(Title);
  private readonly destroyRef = inject(DestroyRef);

  // ---------- Xem tiếp ----------
  /** Popup xem tiếp (tập + vị trí đã lưu). */
  protected readonly resume = signal<{ episode: string; time: number } | null>(null);
  private resumeChecked = false;
  private progressTimer?: ReturnType<typeof setInterval>;

  /** Link tải xuống – chỉ với nguồn DIRECT (mp4). HLS/EMBED không tải trực tiếp được. */
  protected readonly downloadUrl = computed(() => {
    const src = this.store.source();
    return src && src.type === 'DIRECT' ? this.store.playUrl() : null;
  });

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

  /** Số phim hiện tại (cho phần bình luận). */
  protected readonly animeIdNum = computed(() => Number(this.id()));

  /** Tập đang xem dạng số (null nếu không phải số) — gửi kèm bình luận. */
  protected readonly currentEpisodeNum = computed(() => {
    const e = this.store.episodeNumber();
    const n = Number(e);
    return e && Number.isFinite(n) ? n : null;
  });

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
        this.resume.set(null);
        this.resumeChecked = false;
        // Không tự phát: chỉ tải danh sách tập, để người xem tự bấm.
        void this.store.load(id);
      });
    });

    // Tiêu đề tab = tên phim · AnimeEmolite.
    effect(() => {
      const title = this.store.title();
      this.titleService.setTitle(this.store.media() ? `${title} · AnimeEmolite` : 'AnimeEmolite');
    });

    // Khi có danh sách tập: về đúng tập mục tiêu (URL ?ep hoặc tập xem gần nhất) ở trạng thái chờ,
    // rồi nếu tập đó xem dở thì bật popup hỏi xem tiếp.
    effect(() => {
      const eps = this.store.episodes();
      const media = this.store.media();
      if (!media || !eps.length) return;
      untracked(() => {
        if (this.resumeChecked) return;
        this.resumeChecked = true;

        const fromUrl = this.ep();
        const target =
          fromUrl && eps.some(e => sameEpisode(e.episodeNumber, fromUrl)) ? fromUrl : this.readLast();
        if (!target || !eps.some(e => sameEpisode(e.episodeNumber, target))) return;

        this.store.select(target);
        const time = this.readEpisodeProgress(target);
        if (time != null && time > 30) {
          this.resume.set({ episode: target, time: Math.floor(time) });
        }
      });
    });

    // Lưu tiến độ xem mỗi 5 giây để lần sau quay lại xem tiếp.
    this.progressTimer = setInterval(() => this.saveProgress(), 5000);
    this.destroyRef.onDestroy(() => clearInterval(this.progressTimer));

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

  protected play(episodeNumber: string, startAt = 0): void {
    void this.store.play(episodeNumber, startAt);
    if (window.innerWidth < 1024) window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  /**
   * Chọn một tập: về tập đó ở trạng thái chờ (poster + nút play), KHÔNG tự phát.
   * Nếu tập đó đang xem dở → bật popup hỏi xem tiếp.
   */
  protected requestPlay(episodeNumber: string): void {
    this.store.select(episodeNumber);
    if (window.innerWidth < 1024) window.scrollTo({ top: 0, behavior: 'smooth' });

    const time = this.readEpisodeProgress(episodeNumber);
    if (time != null && time > 30) {
      this.resume.set({ episode: episodeNumber, time: Math.floor(time) });
    }
  }

  protected goNext(): void {
    const ep = this.store.episodes()[this.store.episodeIndex() + 1];
    if (ep) this.requestPlay(ep.episodeNumber);
  }

  protected goPrev(): void {
    const ep = this.store.episodes()[this.store.episodeIndex() - 1];
    if (ep) this.requestPlay(ep.episodeNumber);
  }

  /** Nút play trên poster: phát tập đang chọn (hoặc tập đầu) từ đầu. */
  protected startCurrent(): void {
    const ep = this.store.episodeNumber() ?? this.store.episodes()[0]?.episodeNumber;
    if (ep) this.play(ep, 0);
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

  // ---------- Xem tiếp ----------
  /** "Tiếp tục": phát đúng tập, đúng vị trí đã lưu. */
  protected continueResume(): void {
    const r = this.resume();
    if (!r) return;
    this.resume.set(null);
    this.play(r.episode, r.time);
  }

  /** "Xem từ đầu": phát tập đó từ 0. */
  protected startOver(): void {
    const r = this.resume();
    if (!r) return;
    this.resume.set(null);
    this.play(r.episode, 0);
  }

  /** Đóng popup (không phát gì mới). */
  protected dismissResume(): void {
    this.resume.set(null);
  }

  /** Định dạng giây → "mm:ss" hoặc "h:mm:ss". */
  protected formatTime(seconds: number): string {
    const s = Math.max(0, Math.floor(seconds));
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    const pad = (n: number) => n.toString().padStart(2, '0');
    return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`;
  }

  private progressKey(ep: string): string {
    return `ae-progress:${this.animeId()}:${ep}`;
  }

  private lastKey(): string {
    return `ae-last:${this.animeId()}`;
  }

  /** Tiến độ (giây) đã lưu của 1 tập, null nếu chưa có. */
  private readEpisodeProgress(ep: string): number | null {
    try {
      const raw = localStorage.getItem(this.progressKey(ep));
      const n = raw ? Number(raw) : NaN;
      return Number.isFinite(n) ? n : null;
    } catch {
      return null;
    }
  }

  /** Tập xem gần nhất của phim này. */
  private readLast(): string | null {
    try {
      return localStorage.getItem(this.lastKey());
    } catch {
      return null;
    }
  }

  private saveProgress(): void {
    if (this.store.phase() !== 'playing') return;
    const ep = this.store.episodeNumber();
    const player = this.player();
    if (!ep || !player) return;

    const time = player.currentTime();
    const duration = player.duration();
    try {
      // Gần hết tập (>95%) thì xoá để lần sau không gợi ý xem tiếp đoạn cuối.
      if (duration > 0 && time / duration > 0.95) {
        localStorage.removeItem(this.progressKey(ep));
      } else if (time > 5) {
        localStorage.setItem(this.progressKey(ep), String(Math.floor(time)));
        localStorage.setItem(this.lastKey(), ep);
      }
    } catch {
      /* storage bị chặn → bỏ qua */
    }
  }
}

