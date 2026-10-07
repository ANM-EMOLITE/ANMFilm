import { Component, computed, effect, inject, input, linkedSignal, signal, untracked, viewChild } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { formatLabel, pickDescription, seasonLabel, statusLabel } from '@core/utils/media.utils';
import { VideoPlayer } from '@shared/components/video-player/video-player';
import { DropdownOption, UiBadge, UiButton, UiDropdown, UiEmptyState, UiIcon, UiScrollArea, UiSkeleton, UiSpinner } from '@shared/ui';
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

  /** Route param :id và query ?ep= (withComponentInputBinding). */
  readonly id = input.required<string>();
  readonly ep = input<string>();

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

