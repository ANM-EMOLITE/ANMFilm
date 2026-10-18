import { Component, ElementRef, OnDestroy, effect, input, output, untracked, viewChild } from '@angular/core';
import Hls from 'hls.js';
import { StreamType } from '@core/models/api.models';
import { SafeResourceUrlPipe } from '@shared/pipes/safe-resource-url.pipe';
import { UiIcon } from '@shared/ui';

/** Không phát được trong khoảng này kể từ lúc nạp nguồn → coi là lỗi. */
const STARTUP_TIMEOUT_MS = 20_000;
/** Đang phát mà bị đứng (buffer) quá lâu → coi là lỗi. */
const STALL_TIMEOUT_MS = 25_000;

/**
 * Phát HLS (hls.js / Safari native), DIRECT (thẻ video) hoặc EMBED (iframe).
 * Báo `ready` khi bắt đầu phát được, `playbackError` khi lỗi / treo quá lâu
 * để component cha tự đổi sang nguồn khác.
 */
@Component({
  selector: 'app-video-player',
  imports: [SafeResourceUrlPipe, UiIcon],
  templateUrl: './video-player.html',
  styleUrl: './video-player.scss',
})
export class VideoPlayer implements OnDestroy {
  readonly url = input.required<string>();
  readonly type = input.required<StreamType>();
  /** Giây bắt đầu phát (dùng khi chuyển nguồn giữa chừng). */
  readonly startAt = input(0);

  readonly ready = output<void>();
  readonly playbackError = output<string>();

  private readonly video = viewChild<ElementRef<HTMLVideoElement>>('video');
  private hls?: Hls;
  private mediaRecoveries = 0;
  private started = false;
  private failed = false;
  private timer?: ReturnType<typeof setTimeout>;

  constructor() {
    effect(() => {
      const url = this.url();
      const type = this.type();
      const video = this.video()?.nativeElement;

      untracked(() => {
        this.teardown();
        this.started = false;
        this.failed = false;
        this.arm(STARTUP_TIMEOUT_MS, 'Quá thời gian tải video');
        if (type !== 'EMBED' && video) this.load(video, url, type);
      });
    });
  }

  ngOnDestroy(): void {
    this.teardown();
  }

  /** Vị trí đang phát (giây) – để tiếp tục ở nguồn khác. */
  currentTime(): number {
    return this.video()?.nativeElement.currentTime ?? 0;
  }

  /** Tổng thời lượng (giây), 0 nếu chưa biết. */
  duration(): number {
    const d = this.video()?.nativeElement.duration ?? 0;
    return Number.isFinite(d) ? d : 0;
  }

  /** Tua tương đối (giây). Dùng cho nút -5s / +5s / bỏ qua mở đầu. */
  seekBy(delta: number): void {
    const video = this.video()?.nativeElement;
    if (!video) return;
    const duration = Number.isFinite(video.duration) ? video.duration : Infinity;
    video.currentTime = Math.max(0, Math.min(duration, video.currentTime + delta));
  }

  // ---------- Sự kiện từ template ----------
  protected onPlaying(): void {
    this.clearTimer();
    if (!this.started) {
      this.started = true;
      this.ready.emit();
    }
  }

  protected onWaiting(): void {
    if (this.started) this.arm(STALL_TIMEOUT_MS, 'Video bị đứng quá lâu');
  }

  protected onLoadedMetadata(event: Event): void {
    const start = this.startAt();
    if (start > 0) (event.target as HTMLVideoElement).currentTime = start;
  }

  protected onIframeLoad(): void {
    // Iframe không báo lỗi được – coi như phát được khi tải xong.
    this.onPlaying();
  }

  protected onVideoError(): void {
    if (!this.hls) this.fail('Không phát được video');
  }

  // ---------- Nội bộ ----------
  private load(video: HTMLVideoElement, url: string, type: StreamType): void {
    const isHls = type === 'HLS' || /\.m3u8|\/m3u8\//i.test(url);

    if (isHls && Hls.isSupported()) {
      const hls = new Hls({ maxBufferLength: 30, fragLoadingMaxRetry: 3, manifestLoadingMaxRetry: 2 });
      this.hls = hls;
      this.mediaRecoveries = 0;

      hls.on(Hls.Events.ERROR, (_, data) => {
        if (!data.fatal) return;
        // Lỗi decode: thử phục hồi tối đa 2 lần, tránh vòng lặp tải lại segment vô hạn.
        if (data.type === Hls.ErrorTypes.MEDIA_ERROR && this.mediaRecoveries < 2) {
          if (this.mediaRecoveries++ === 1) hls.swapAudioCodec();
          hls.recoverMediaError();
          return;
        }
        const code = data.response?.code ? ` (HTTP ${data.response.code})` : '';
        this.fail(`HLS ${data.details}${code}`);
      });

      hls.loadSource(url);
      hls.attachMedia(video);
    } else {
      // Safari phát HLS native, DIRECT phát trực tiếp.
      video.src = url;
    }

    video.play().catch(() => {
      /* autoplay có thể bị chặn, người dùng tự bấm play */
    });
  }

  private fail(message: string): void {
    if (this.failed) return;
    this.failed = true;
    this.teardown();
    this.playbackError.emit(message);
  }

  private arm(ms: number, message: string): void {
    this.clearTimer();
    this.timer = setTimeout(() => {
      // Tab đang ẩn: trình duyệt tạm dừng tải video → chờ tiếp, không coi là lỗi.
      if (document.hidden) return this.arm(ms, message);
      // Bị chặn autoplay (video đang pause, chưa phát) thì không tính là lỗi.
      const video = this.video()?.nativeElement;
      if (video && video.paused && video.readyState >= 2) return;
      this.fail(message);
    }, ms);
  }

  private clearTimer(): void {
    clearTimeout(this.timer);
    this.timer = undefined;
  }

  private teardown(): void {
    this.clearTimer();
    this.hls?.destroy();
    this.hls = undefined;
  }
}
