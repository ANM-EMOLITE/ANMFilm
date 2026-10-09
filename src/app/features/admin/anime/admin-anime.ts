import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, ParamMap, Router, RouterLink } from '@angular/router';
import { Observable, Subject, catchError, debounceTime, distinctUntilChanged, map, of, switchMap, takeWhile, tap, timer } from 'rxjs';
import { AdminAnime, AdminAnimePage, AdminList, AdminProviderStatus, SyncJob } from '@core/models/admin.models';
import { AdminApi } from '@core/services/admin-api';
import {
  DropdownOption,
  TableColumn,
  ToastService,
  UiBadge,
  UiButton,
  UiCellDef,
  UiDropdown,
  UiEmptyState,
  UiIcon,
  UiSpinner,
  UiSwitch,
  UiTable,
} from '@shared/ui';

type YesNo = '' | 'yes' | 'no';
type Health = '' | 'broken' | 'ok' | 'unchecked';

/** Bộ lọc lấy từ URL để F5 / chia sẻ link vẫn giữ nguyên. */
interface Filters {
  q: string;
  stream: YesNo;
  hidden: YesNo;
  health: Health;
  list: string;
  page: number;
}

const PAGE_SIZE = 30;

const STATUS_LABELS: Record<string, string> = {
  RELEASING: 'Đang chiếu',
  FINISHED: 'Hoàn thành',
  NOT_YET_RELEASED: 'Sắp chiếu',
  CANCELLED: 'Đã hủy',
  HIATUS: 'Tạm ngưng',
};

@Component({
  selector: 'app-admin-anime',
  imports: [
    DatePipe, FormsModule, RouterLink,
    UiBadge, UiButton, UiCellDef, UiDropdown, UiEmptyState, UiIcon, UiSpinner, UiSwitch, UiTable,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './admin-anime.html',
  styleUrl: './admin-anime.scss',
})
export class AdminAnimeList {
  private readonly api = inject(AdminApi);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);
  private readonly destroyRef = inject(DestroyRef);

  /** Job đang chạy cho 1 phim (lưu sẵn nguồn phát / kiểm tra nguồn) + tiến độ. Mỗi lúc 1 job. */
  protected readonly prefetching = signal<{ id: number; kind: 'STREAMS' | 'HEALTH'; progress: string } | null>(null);

  protected readonly filters = signal<Filters>({ q: '', stream: '', hidden: '', health: '', list: '', page: 1 });
  protected readonly data = signal<AdminAnimePage | null>(null);
  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);

  /** ID đang ẩn/hiện hoặc đồng bộ (khóa nút của dòng đó). */
  protected readonly busy = signal<Set<number>>(new Set());

  protected searchText = '';
  private readonly search$ = new Subject<string>();

  protected addId = '';
  protected readonly adding = signal(false);

  protected readonly lists = signal<AdminList[]>([]);
  protected readonly listOptions = computed<DropdownOption[]>(() => [
    { value: '', label: 'Tất cả danh sách' },
    ...this.lists().map(l => ({ value: l.key, label: l.label, hint: `${l.itemCount}` })),
  ]);

  protected readonly streamOptions: DropdownOption<YesNo>[] = [
    { value: '', label: 'Nguồn phát: tất cả' },
    { value: 'yes', label: 'Có nguồn phát' },
    { value: 'no', label: 'Chưa có nguồn' },
  ];

  protected readonly hiddenOptions: DropdownOption<YesNo>[] = [
    { value: '', label: 'Hiển thị: tất cả' },
    { value: 'no', label: 'Đang hiện' },
    { value: 'yes', label: 'Đang ẩn' },
  ];

  protected readonly healthOptions: DropdownOption<Health>[] = [
    { value: '', label: 'Tình trạng nguồn: tất cả' },
    { value: 'broken', label: 'Có nguồn lỗi' },
    { value: 'ok', label: 'Nguồn chạy tốt' },
    { value: 'unchecked', label: 'Chưa kiểm tra' },
  ];

  protected readonly columns: TableColumn<AdminAnime>[] = [
    { key: 'title', header: 'Phim' },
    { key: 'info', header: 'Thông tin', width: '170px' },
    { key: 'providers', header: 'Nguồn phát', width: '230px' },
    { key: 'visible', header: 'Hiển thị', width: '110px', align: 'center' },
    { key: 'actions', header: '', width: '130px', align: 'right' },
  ];

  protected readonly totalPages = computed(() => {
    const d = this.data();
    return d ? Math.max(1, Math.ceil(d.total / d.pageSize)) : 1;
  });

  /** Tăng khi thao tác lỗi → dựng lại các dòng để công tắc (đã tự bật/tắt) quay về đúng trạng thái thật. */
  private readonly rev = signal(0);
  protected readonly trackAnime = computed(() => {
    const rev = this.rev();
    return (a: AdminAnime) => `${a.id}:${rev}`;
  });

  constructor() {
    this.api.stats().pipe(takeUntilDestroyed()).subscribe({ next: s => this.lists.set(s.lists), error: () => {} });

    inject(ActivatedRoute)
      .queryParamMap.pipe(
        map(parseFilters),
        tap(f => {
          this.filters.set(f);
          this.searchText = f.q;
          this.loading.set(true);
          this.error.set(null);
        }),
        switchMap(f =>
          this.api
            .listAnime({
              q: f.q,
              hasStream: f.stream ? f.stream === 'yes' : null,
              hidden: f.hidden ? f.hidden === 'yes' : null,
              health: f.health || null,
              list: f.list,
              page: f.page,
              pageSize: PAGE_SIZE,
            })
            .pipe(
              catchError((message: string) => {
                this.error.set(message);
                return of(null);
              }),
            ),
        ),
        takeUntilDestroyed(),
      )
      .subscribe(page => {
        this.loading.set(false);
        this.data.set(page);
      });

    this.search$
      .pipe(debounceTime(350), distinctUntilChanged(), takeUntilDestroyed())
      .subscribe(q => this.setFilter({ q: q.trim() }));
  }

  protected onSearch(value: string): void {
    this.search$.next(value);
  }

  protected setFilter(change: Partial<Filters>): void {
    const next = { ...this.filters(), page: 1, ...change };
    this.router.navigate([], {
      queryParams: {
        q: next.q || null,
        stream: next.stream || null,
        hidden: next.hidden || null,
        health: next.health || null,
        list: next.list || null,
        page: next.page > 1 ? next.page : null,
      },
    });
  }

  protected clearFilters(): void {
    this.searchText = '';
    this.setFilter({ q: '', stream: '', hidden: '', health: '', list: '' });
  }

  protected readonly hasFilters = computed(() => {
    const f = this.filters();
    return !!(f.q || f.stream || f.hidden || f.health || f.list);
  });

  protected setVisible(anime: AdminAnime, visible: boolean): void {
    this.withBusy(anime.id, this.api.setHidden(anime.id, !visible), updated => {
      this.replace(updated);
      this.toast.show(
        visible ? 'success' : 'info',
        visible ? 'Đã hiện phim' : 'Đã ẩn phim',
        visible ? `“${updated.title}” hiển thị lại cho người xem` : `“${updated.title}” không còn hiển thị cho người xem`,
      );
    });
  }

  protected resync(anime: AdminAnime): void {
    this.withBusy(anime.id, this.api.syncAnime(anime.id), res => {
      this.replace(res.anime);
      this.toast.show('success', 'Đã cập nhật', `“${res.anime.title}” · ${res.anime.providers.length} nguồn phát`);
    });
  }

  /**
   * Lưu sẵn link stream mọi tập vào DB → khi xem không phải chờ AniMapper (kể cả lúc AniMapper sập).
   * Chạy nền, theo dõi tiến độ mỗi 2 giây.
   */
  protected prefetch(anime: AdminAnime): void {
    if (this.prefetching()) {
      this.toast.show('warning', 'Đang lưu phim khác', 'Đợi lần lưu hiện tại xong rồi thử lại');
      return;
    }

    this.prefetching.set({ id: anime.id, kind: 'STREAMS', progress: 'Đang bắt đầu…' });
    this.api.prefetchStreams(anime.id).subscribe({
      next: job => this.watchPrefetch(anime.id, job),
      error: (message: string) => {
        this.prefetching.set(null);
        this.toast.show('danger', 'Không lưu được nguồn phát', message);
      },
    });
  }

  /**
   * Kiểm tra nguồn phát 1 phim: thử mở link tập đầu của từng provider.
   * Provider lỗi → tự tắt (trang xem dùng provider khác); không còn provider chạy → tự ẩn phim.
   */
  protected check(anime: AdminAnime): void {
    if (this.prefetching()) {
      this.toast.show('warning', 'Đang chạy việc khác', 'Đợi việc hiện tại xong rồi thử lại');
      return;
    }

    this.prefetching.set({ id: anime.id, kind: 'HEALTH', progress: 'Đang bắt đầu…' });
    this.api.checkAnime(anime.id).subscribe({
      next: job => this.watchPrefetch(anime.id, job),
      error: (message: string) => {
        this.prefetching.set(null);
        this.toast.show('danger', 'Không kiểm tra được', message);
      },
    });
  }

  /** Admin tự bật/tắt 1 provider (kiểm tra tự động sẽ không ghi đè). */
  protected toggleProvider(anime: AdminAnime, provider: string, disabled: boolean): void {
    this.withBusy(anime.id, this.api.setProviderDisabled(anime.id, provider, disabled), updated => {
      this.replace(updated);
      this.toast.show(
        disabled ? 'info' : 'success',
        disabled ? `Đã tắt ${provider}` : `Đã bật ${provider}`,
        `“${updated.title}”${disabled ? ' – trang xem sẽ dùng nguồn khác' : ''}`,
      );
    });
  }

  protected providerTitle(s: AdminProviderStatus | null): string {
    if (!s) return 'Chưa kiểm tra — bấm để tắt';
    const state = s.status === 'OK' ? 'Chạy tốt' : `Lỗi: ${s.lastError ?? ''}`;
    const when = new Date(s.checkedAt).toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' });
    const off = s.isDisabled ? (s.disabledBy === 'ADMIN' ? ' · admin đã tắt' : ' · đã tự tắt') : '';
    return `${state} · kiểm tra ${when}${off} — bấm để ${s.isDisabled ? 'bật' : 'tắt'}`;
  }

  protected providerStatus(anime: AdminAnime, provider: string) {
    return anime.providerStatuses?.find(s => s.provider === provider) ?? null;
  }

  /** Lấy lại 1 dòng sau khi job xong (trạng thái nguồn / ẩn tự động có thể đã đổi). */
  private reloadRow(animeId: number): void {
    this.api.listAnime({ q: String(animeId), pageSize: 5 }).subscribe({
      next: page => {
        const updated = page.items.find(a => a.id === animeId);
        if (updated) this.replace(updated);
      },
      error: () => {},
    });
  }

  private watchPrefetch(animeId: number, job: SyncJob): void {
    const active = (j: SyncJob) => j.status === 'QUEUED' || j.status === 'RUNNING';

    timer(0, 2000)
      .pipe(
        switchMap(() => this.api.job(job.id)),
        takeWhile(active, true),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: j => {
          if (active(j)) {
            this.prefetching.set({ id: animeId, kind: j.kind === 'HEALTH' ? 'HEALTH' : 'STREAMS', progress: j.progress ?? '' });
            return;
          }

          this.prefetching.set(null);
          this.reloadRow(animeId);

          if (j.kind === 'HEALTH') {
            if (j.status === 'FAILED') this.toast.show('danger', 'Kiểm tra thất bại', j.error ?? '', 10000);
            else if (j.error) this.toast.show('warning', 'Mọi nguồn đều lỗi', j.error, 12000);
            else if (j.updated) this.toast.show('warning', 'Có nguồn lỗi', `${j.target} · nguồn lỗi đã được tắt, trang xem dùng nguồn khác`, 10000);
            else this.toast.show('success', 'Nguồn phát chạy tốt', j.target ?? '', 6000);
            return;
          }

          const saved = j.added + j.updated;
          const summary = `${j.target} · Lưu ${saved} tập · ${j.skipped} tập đã có sẵn`;
          if (j.status === 'FAILED') this.toast.show('danger', 'Lưu nguồn phát thất bại', j.error ?? summary, 10000);
          else if (j.error) this.toast.show('warning', 'Đã lưu, một số tập lỗi', `${summary}. ${j.error}`, 12000);
          else this.toast.show('success', 'Đã lưu sẵn nguồn phát', summary, 8000);
        },
        error: (message: string) => {
          this.prefetching.set(null);
          this.toast.show('danger', 'Mất kết nối khi theo dõi', message);
        },
      });
  }

  /** Thêm phim theo ID AniList (vd: 154587). Đã có thì báo tồn tại và cập nhật lại. */
  protected addById(): void {
    const id = Number(this.addId.trim());
    if (!Number.isInteger(id) || id <= 0 || this.adding()) {
      this.toast.show('warning', 'ID không hợp lệ', 'Nhập ID AniList, vd: 154587');
      return;
    }

    this.adding.set(true);
    this.api.syncAnime(id).subscribe({
      next: res => {
        this.adding.set(false);
        this.addId = '';
        if (res.created) {
          this.toast.show('success', 'Đã thêm phim', `“${res.anime.title}”`);
        } else {
          this.toast.show('warning', 'Phim đã tồn tại', `“${res.anime.title}” đã có trong danh mục – đã cập nhật lại dữ liệu`);
        }
        this.setFilter({ q: String(res.anime.id), stream: '', hidden: '', health: '', list: '' });
      },
      error: (message: string) => {
        this.adding.set(false);
        this.toast.show('danger', 'Không thêm được', message);
      },
    });
  }

  protected goTo(page: number): void {
    this.setFilter({ page: Math.min(Math.max(1, page), this.totalPages()) });
  }

  protected statusLabel(status?: string | null): string {
    return status ? (STATUS_LABELS[status] ?? status) : '';
  }

  private replace(updated: AdminAnime): void {
    this.data.update(d => d && { ...d, items: d.items.map(a => (a.id === updated.id ? updated : a)) });
  }

  private withBusy<T>(id: number, source: Observable<T>, onSuccess: (value: T) => void): void {
    if (this.busy().has(id)) return;
    this.busy.update(s => new Set(s).add(id));

    const done = () => this.busy.update(s => { const n = new Set(s); n.delete(id); return n; });
    source.subscribe({
      next: value => {
        done();
        onSuccess(value);
      },
      error: (message: string) => {
        done();
        this.rev.update(v => v + 1);
        this.toast.show('danger', 'Thao tác thất bại', message);
      },
    });
  }
}

function parseFilters(p: ParamMap): Filters {
  const yesNo = (v: string | null): YesNo => (v === 'yes' || v === 'no' ? v : '');
  const page = Number(p.get('page'));
  return {
    q: p.get('q') ?? '',
    stream: yesNo(p.get('stream')),
    hidden: yesNo(p.get('hidden')),
    health: (['broken', 'ok', 'unchecked'] as const).find(h => h === p.get('health')) ?? '',
    list: p.get('list') ?? '',
    page: Number.isInteger(page) && page > 0 ? page : 1,
  };
}
