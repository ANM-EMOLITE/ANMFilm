import { Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, ParamMap, Router, RouterLink } from '@angular/router';
import { Observable, catchError, map, of, switchMap, tap } from 'rxjs';
import { BrowseTab, MediaSearchResult, SearchResponse, Season } from '@core/models/api.models';
import { AnimeApi } from '@core/services/anime-api';
import { errorMessage, formatLabel, pickDescription, pickTitle, seasonLabel } from '@core/utils/media.utils';
import { MediaCard } from '@shared/components/media-card/media-card';
import {
  DropdownOption,
  TabItem,
  UiBadge,
  UiButton,
  UiDropdown,
  UiEmptyState,
  UiIcon,
  UiSkeleton,
  UiSpinner,
  UiTabs,
} from '@shared/ui';

/** Số phim mỗi lần tải – hết thì bấm "Xem thêm" để tải tiếp. */
const PAGE_SIZE = 50;

const SEASONS: Season[] = ['WINTER', 'SPRING', 'SUMMER', 'FALL'];

interface TabDef extends TabItem<BrowseTab> {
  hint: string;
}

const TABS: TabDef[] = [
  { id: 'TRENDING', label: 'Thịnh hành', icon: 'flame', hint: 'Đang được xem nhiều gần đây' },
  { id: 'POPULAR', label: 'Phổ biến', icon: 'sparkles', hint: 'Phổ biến nhất mọi thời đại' },
  { id: 'SEASON', label: 'Theo mùa', icon: 'calendar', hint: 'Anime theo mùa phát sóng' },
  { id: 'NEW', label: 'Phim mới', icon: 'zap', hint: 'Ra mắt trong 6 tháng gần đây' },
  { id: 'AIRING', label: 'Đang chiếu', icon: 'tv', hint: 'Đang phát sóng, có tập mới hằng tuần' },
  { id: 'FINISHED', label: 'Trọn bộ', icon: 'check', hint: 'Đã chiếu hết toàn bộ tập, mới hoàn thành gần đây' },
  { id: 'MOVIE', label: 'Phim lẻ', icon: 'film', hint: 'Anime movie' },
];

/** Trạng thái trang lấy từ URL: ?q=... (tìm kiếm) hoặc ?tab=season&season=FALL&year=2026. */
interface PageState {
  q: string;
  tab: BrowseTab;
  season: Season;
  year: number;
}

function currentSeason(now = new Date()): { season: Season; year: number } {
  return { season: SEASONS[Math.floor(now.getMonth() / 3)], year: now.getFullYear() };
}

function shiftSeason(season: Season, year: number, delta: number): { season: Season; year: number } {
  const index = year * 4 + SEASONS.indexOf(season) + delta;
  return { season: SEASONS[((index % 4) + 4) % 4], year: Math.floor(index / 4) };
}

@Component({
  selector: 'app-search-page',
  imports: [RouterLink, MediaCard, UiBadge, UiButton, UiDropdown, UiEmptyState, UiIcon, UiSkeleton, UiSpinner, UiTabs],
  templateUrl: './search-page.html',
  styleUrl: './search-page.scss',
})
export class SearchPage {
  private readonly api = inject(AnimeApi);
  private readonly router = inject(Router);

  readonly tabs = TABS;
  readonly pageSize = PAGE_SIZE;
  readonly skeletons = Array.from({ length: 18 }, (_, i) => i);

  readonly seasonOptions: DropdownOption<Season>[] = SEASONS.map(s => ({ value: s, label: `Mùa ${seasonLabel(s)}` }));
  readonly yearOptions: DropdownOption<number>[] = Array.from({ length: currentSeason().year + 2 - 1970 }, (_, i) => {
    const year = currentSeason().year + 1 - i;
    return { value: year, label: String(year) };
  });

  readonly state = signal<PageState>({ q: '', tab: 'TRENDING', ...currentSeason() });
  readonly results = signal<MediaSearchResult[]>([]);
  readonly total = signal(0);
  readonly nextOffset = signal<number | null>(null);
  readonly loading = signal(false);
  readonly loadingMore = signal(false);
  readonly error = signal<string | null>(null);

  readonly activeTab = computed(() => TABS.find(t => t.id === this.state().tab) ?? TABS[0]);
  readonly seasonTitle = computed(() => `Mùa ${seasonLabel(this.state().season)} ${this.state().year}`);

  /** Phim nổi bật (hero) – phim đầu tiên của tab Thịnh hành. */
  readonly featured = computed(() => {
    const s = this.state();
    return !s.q && s.tab === 'TRENDING' ? (this.results()[0] ?? null) : null;
  });
  readonly gridItems = computed(() => (this.featured() ? this.results().slice(1) : this.results()));

  protected readonly pickTitle = pickTitle;
  protected readonly pickDescription = pickDescription;
  protected readonly formatLabel = formatLabel;

  constructor() {
    inject(ActivatedRoute)
      .queryParamMap.pipe(
        map(parseState),
        tap(state => {
          this.state.set(state);
          this.results.set([]);
          this.total.set(0);
          this.nextOffset.set(null);
          this.error.set(null);
          this.loading.set(true);
        }),
        switchMap(state => this.fetch(state, 0)),
        takeUntilDestroyed(),
      )
      .subscribe(res => this.applyFirstPage(res));
  }

  retry(): void {
    this.error.set(null);
    this.loading.set(true);
    this.fetch(this.state(), 0).subscribe(res => this.applyFirstPage(res));
  }

  selectTab(tab: BrowseTab): void {
    this.router.navigate(['/'], { queryParams: { tab: tab.toLowerCase() } });
  }

  loadMore(): void {
    const offset = this.nextOffset();
    if (offset === null || this.loadingMore()) return;

    const state = this.state();
    this.loadingMore.set(true);
    this.fetch(state, offset).subscribe(res => {
      this.loadingMore.set(false);
      // Bỏ qua nếu người dùng đã chuyển tab trong lúc đang tải.
      if (!res || this.state() !== state) return;

      const seen = new Set(this.results().map(m => m.id));
      this.results.update(list => [...list, ...res.results.filter(m => !seen.has(m.id))]);
      this.nextOffset.set(res.hasNextPage ? (res.nextOffset ?? res.offset + res.results.length) : null);
    });
  }

  selectSeason(season: Season, year: number): void {
    this.router.navigate(['/'], { queryParams: { tab: 'season', season: season.toLowerCase(), year } });
  }

  shiftSeason(delta: number): void {
    const { season, year } = shiftSeason(this.state().season, this.state().year, delta);
    this.selectSeason(season, year);
  }

  scrollTop(): void {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  private applyFirstPage(res: SearchResponse | null): void {
    this.loading.set(false);
    this.results.set(res?.results ?? []);
    this.total.set(res?.total ?? 0);
    this.nextOffset.set(res?.hasNextPage ? (res.nextOffset ?? res.offset + res.results.length) : null);
  }

  private fetch(state: PageState, offset: number): Observable<SearchResponse | null> {
    const request = state.q
      ? this.api.search({ title: state.q, mediaType: 'ANIME', limit: PAGE_SIZE, offset })
      : this.api.browse({
          tab: state.tab,
          season: state.tab === 'SEASON' ? state.season : undefined,
          seasonYear: state.tab === 'SEASON' ? state.year : undefined,
          limit: PAGE_SIZE,
          offset,
        });

    return request.pipe(
      catchError(err => {
        this.error.set(errorMessage(err));
        return of(null);
      }),
    );
  }
}

function parseState(params: ParamMap): PageState {
  const tab = (params.get('tab') ?? '').toUpperCase() as BrowseTab;
  const season = (params.get('season') ?? '').toUpperCase() as Season;
  const year = Number(params.get('year'));
  const current = currentSeason();

  return {
    q: params.get('q')?.trim() ?? '',
    tab: TABS.some(t => t.id === tab) ? tab : 'TRENDING',
    season: SEASONS.includes(season) ? season : current.season,
    year: Number.isInteger(year) && year >= 1940 && year <= 2100 ? year : current.year,
  };
}
