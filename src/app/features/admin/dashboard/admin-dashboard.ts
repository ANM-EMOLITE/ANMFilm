import { DatePipe, DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { Subscription, switchMap, takeWhile, timer } from 'rxjs';
import { AdminStats, SyncJob, SyncJobStatus } from '@core/models/admin.models';
import { BrowseTab } from '@core/models/api.models';
import { AdminApi } from '@core/services/admin-api';
import {
  BadgeTone,
  TableColumn,
  ToastService,
  UiBadge,
  UiButton,
  UiCellDef,
  UiEmptyState,
  UiIcon,
  UiSkeleton,
  UiSpinner,
  UiSwitch,
  UiTable,
} from '@shared/ui';

const TABS: { id: BrowseTab; label: string; hint: string }[] = [
  { id: 'TRENDING', label: 'Thịnh hành', hint: '~200 phim' },
  { id: 'POPULAR', label: 'Phổ biến', hint: '~300 phim' },
  { id: 'SEASON', label: 'Theo mùa', hint: '4 mùa gần nhất' },
  { id: 'NEW', label: 'Phim mới', hint: '6 tháng gần đây' },
  { id: 'AIRING', label: 'Đang chiếu', hint: '~200 phim' },
  { id: 'FINISHED', label: 'Trọn bộ', hint: '~200 phim' },
  { id: 'MOVIE', label: 'Phim lẻ', hint: '~200 phim' },
];

const STATUS: Record<SyncJobStatus, { label: string; tone: BadgeTone }> = {
  QUEUED: { label: 'Đang chờ', tone: 'info' },
  RUNNING: { label: 'Đang chạy', tone: 'warning' },
  SUCCEEDED: { label: 'Thành công', tone: 'success' },
  FAILED: { label: 'Thất bại', tone: 'danger' },
  CANCELED: { label: 'Đã huỷ', tone: 'neutral' },
};

const isActive = (job: SyncJob | null | undefined) => job?.status === 'QUEUED' || job?.status === 'RUNNING';

@Component({
  selector: 'app-admin-dashboard',
  imports: [
    DatePipe, DecimalPipe, RouterLink,
    UiBadge, UiButton, UiCellDef, UiEmptyState, UiIcon, UiSkeleton, UiSpinner, UiSwitch, UiTable,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './admin-dashboard.html',
  styleUrl: './admin-dashboard.scss',
})
export class AdminDashboard {
  private readonly api = inject(AdminApi);
  private readonly toast = inject(ToastService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly tabs = TABS;
  protected readonly status = STATUS;

  protected readonly stats = signal<AdminStats | null>(null);
  protected readonly jobs = signal<SyncJob[]>([]);
  protected readonly loadError = signal<string | null>(null);

  protected readonly selected = signal<Set<BrowseTab>>(new Set(TABS.map(t => t.id)));
  protected readonly updateExisting = signal(false);
  protected readonly starting = signal(false);
  protected readonly canceling = signal(false);

  /** Job đang chạy (hoặc vừa chạy xong trong phiên này). */
  protected readonly current = signal<SyncJob | null>(null);
  protected readonly running = computed(() => isActive(this.current()));

  protected readonly jobColumns: TableColumn<SyncJob>[] = [
    { key: 'createdAt', header: 'Thời gian', width: '150px' },
    { key: 'status', header: 'Trạng thái', width: '120px' },
    { key: 'lists', header: 'Danh sách' },
    { key: 'result', header: 'Kết quả' },
    { key: 'triggeredBy', header: 'Người chạy', width: '110px' },
  ];

  private polling?: Subscription;

  constructor() {
    this.refresh();
    this.destroyRef.onDestroy(() => this.polling?.unsubscribe());
  }

  protected refresh(): void {
    this.loadError.set(null);
    this.api.stats().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: stats => {
        this.stats.set(stats);
        // Mở trang khi đang có job chạy → tiếp tục theo dõi.
        if (isActive(stats.lastJob) && !this.polling) this.watch(stats.lastJob!);
      },
      error: (message: string) => this.loadError.set(message),
    });
    this.api.jobs(10).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: jobs => this.jobs.set(jobs),
      error: () => {},
    });
  }

  protected toggle(tab: BrowseTab): void {
    this.selected.update(set => {
      const next = new Set(set);
      if (next.has(tab)) next.delete(tab);
      else next.add(tab);
      return next;
    });
  }

  protected selectAll(all: boolean): void {
    this.selected.set(new Set(all ? TABS.map(t => t.id) : []));
  }

  protected start(): void {
    const lists = TABS.map(t => t.id).filter(id => this.selected().has(id));
    if (!lists.length || this.starting() || this.running()) return;

    this.starting.set(true);
    this.api.startSync(lists, this.updateExisting()).subscribe({
      next: job => {
        this.starting.set(false);
        this.watch(job);
      },
      error: (message: string) => {
        this.starting.set(false);
        this.toast.show('danger', 'Không bắt đầu được', message);
        this.refresh();
      },
    });
  }

  /** Kiểm tra nguồn phát các phim trong danh sách đã chọn: nguồn lỗi tự tắt, phim không còn nguồn chạy thì tự ẩn. */
  protected startCheck(): void {
    const lists = TABS.map(t => t.id).filter(id => this.selected().has(id));
    if (!lists.length || this.starting() || this.running()) return;

    this.starting.set(true);
    this.api.startHealthCheck(lists, this.updateExisting()).subscribe({
      next: job => {
        this.starting.set(false);
        this.watch(job);
      },
      error: (message: string) => {
        this.starting.set(false);
        this.toast.show('danger', 'Không bắt đầu được', message);
        this.refresh();
      },
    });
  }

  /** Dừng job đang chạy / đang chờ. Polling sẽ tự cập nhật trạng thái "Đã huỷ". */
  protected cancel(): void {
    const job = this.current();
    if (!job || !isActive(job) || this.canceling()) return;

    this.canceling.set(true);
    this.api.cancelJob(job.id).subscribe({
      next: () => this.canceling.set(false),
      error: (message: string) => {
        this.canceling.set(false);
        this.toast.show('danger', 'Không dừng được', message);
      },
    });
  }

  protected tabLabels(lists: string[]): string {
    return lists.map(id => TABS.find(t => t.id === id)?.label ?? id).join(', ');
  }

  protected duration(job: SyncJob): string {
    if (!job.startedAt) return '';
    const end = job.finishedAt ? Date.parse(job.finishedAt) : Date.now();
    const seconds = Math.max(0, Math.round((end - Date.parse(job.startedAt)) / 1000));
    return seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
  }

  protected readonly trackJob = (job: SyncJob) => job.id;

  protected statusOf(status: SyncJobStatus) {
    return STATUS[status] ?? STATUS.FAILED;
  }

  /** Hỏi trạng thái job mỗi 2 giây cho tới khi xong. */
  private watch(job: SyncJob): void {
    this.current.set(job);
    this.polling?.unsubscribe();
    this.polling = timer(0, 2000)
      .pipe(
        switchMap(() => this.api.job(job.id)),
        takeWhile(j => isActive(j), true),
      )
      .subscribe({
        next: j => {
          this.current.set(j);
          if (!isActive(j)) this.finished(j);
        },
        error: (message: string) => this.toast.show('danger', 'Mất kết nối khi theo dõi đồng bộ', message),
      });
  }

  private finished(job: SyncJob): void {
    this.polling = undefined;
    this.canceling.set(false);
    this.refresh();

    if (job.status === 'CANCELED') {
      this.toast.show('info', 'Đã dừng', 'Job đã được huỷ.', 6000);
      return;
    }

    if (job.status === 'FAILED') {
      this.toast.show('danger', 'Đồng bộ thất bại', job.error ?? undefined, 8000);
      return;
    }

    if (job.kind === 'HEALTH') {
      const summary = `${job.added} phim chạy tốt · ${job.updated} phim có nguồn lỗi (đã tắt nguồn lỗi) · ${job.skipped} đã kiểm tra trong 24h`;
      this.toast.show(job.updated || job.error ? 'warning' : 'success', 'Kiểm tra nguồn phát xong', job.error ? `${summary}. ${job.error}` : summary, 12000);
      return;
    }

    if (job.kind === 'STREAMS') {
      const summary = `${job.target} · Lưu ${job.added + job.updated} tập · ${job.skipped} tập đã có sẵn`;
      this.toast.show(job.error ? 'warning' : 'success', 'Lưu nguồn phát xong', job.error ? `${summary}. ${job.error}` : summary, 10000);
      return;
    }

    const parts = [`Tạo mới ${job.added} phim`];
    if (job.updated) parts.push(`cập nhật ${job.updated}`);
    if (job.skipped) parts.push(`${job.skipped} phim đã tồn tại (bỏ qua)`);
    if (job.error) {
      this.toast.show('warning', 'Đồng bộ xong, có danh sách bị lỗi', `${parts.join(' · ')}. ${job.error}`, 10000);
      return;
    }
    this.toast.show(job.added ? 'success' : 'info', 'Đồng bộ xong', parts.join(' · '), 8000);
  }
}
