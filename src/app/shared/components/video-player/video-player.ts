import { Component, ElementRef, OnDestroy, effect, input, output, viewChild } from '@angular/core';
import Hls from 'hls.js';
import { StreamType } from '../../core/models/api.models';
import { SafeResourceUrlPipe } from '../safe-resource-url.pipe';

/**
 * Phát HLS (hls.js / Safari native), DIRECT (thẻ video) hoặc EMBED (iframe).
 */
@Component({
  selector: 'app-video-player',
  imports: [SafeResourceUrlPipe],
  templateUrl: './video-player.html',
  styleUrl: './video-player.scss',
})
export class VideoPlayer implements OnDestroy {
  readonly url = input.required<string>();
  readonly type = input.required<StreamType>();

  /** Báo lỗi phát cho component cha (để hiển thị / gợi ý bật proxy). */
  readonly playbackError = output<string>();

  private readonly video = viewChild<ElementRef<HTMLVideoElement>>('video');
  private hls?: Hls;
  private mediaRecoveries = 0;

  constructor() {
    effect(() => {
      const url = this.url();
      const type = this.type();
      const video = this.video()?.nativeElement;

      this.destroyHls();
      if (type !== 'EMBED' && video) this.load(video, url, type);
    });
  }

  ngOnDestroy(): void {
    this.destroyHls();
  }

  private load(video: HTMLVideoElement, url: string, type: StreamType): void {
    const isHls = type === 'HLS' || /\.m3u8|\/m3u8\//i.test(url);

    if (isHls && Hls.isSupported()) {
      const hls = new Hls({ maxBufferLength: 30 });
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
        this.playbackError.emit(`HLS ${data.details}${code}`);
        this.destroyHls();
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

  onVideoError(): void {
    if (!this.hls) this.playbackError.emit('Không phát được video (DIRECT/native)');
  }

  private destroyHls(): void {
    this.hls?.destroy();
    this.hls = undefined;
  }
}
