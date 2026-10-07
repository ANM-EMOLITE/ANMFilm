import { Component, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { Episode, MediaDetail, StreamSource } from '../../core/models/api.models';
import { AnimeApi } from '../../core/services/anime-api';
import { errorMessage, pickDescription, pickTitle } from '../../core/utils/media.utils';
import { VideoPlayer } from '../../shared/video-player/video-player';

/**
 * Luồng xem phim:
 * metadata (lấy provider) → servers → episodes → source → player (qua proxy nếu cần).
 */
@Component({
  selector: 'app-watch-page',
  imports: [VideoPlayer],
  templateUrl: './watch-page.html',
  styleUrl: './watch-page.scss',
})
export class WatchPage {
  private readonly api = inject(AnimeApi);

  /** Route param :id (withComponentInputBinding). */
  readonly id = input.required<string>();

  readonly media = signal<MediaDetail | null>(null);
  readonly mediaError = signal<string | null>(null);

  readonly providers = computed(() => Object.keys(this.media()?.streamingProviders ?? {}));
  readonly provider = signal('');

  readonly servers = signal<string[]>([]);
  readonly server = signal('');

  readonly episodes = signal<Episode[]>([]);
  readonly episodesLoading = signal(false);
  readonly episodesError = signal<string | null>(null);

  readonly currentEpisode = signal<Episode | null>(null);
  readonly source = signal<StreamSource | null>(null);
  readonly sourceLoading = signal(false);
  readonly playerError = signal<string | null>(null);
  readonly forceProxy = signal(false);

  readonly title = computed(() => pickTitle(this.media()?.titles));
  readonly description = computed(() => pickDescription(this.media()?.descriptions));

  readonly useProxy = computed(() => {
    const src = this.source();
    return !!src && src.type !== 'EMBED' && (src.corsProxyRequired || this.forceProxy());
  });

  /** URL thực sự đưa vào player. */
  readonly playUrl = computed(() => {
    const src = this.source();
    if (!src) return '';
    return this.useProxy() ? this.api.buildProxyUrl(src.url, src.proxyHeaders) : src.url;
  });

  constructor() {
    // Đổi :id → tải lại metadata.
    effect(() => {
      const id = this.id();
      untracked(() => this.loadMedia(id));
    });
  }

  async loadMedia(id: string): Promise<void> {
    this.media.set(null);
    this.mediaError.set(null);
    this.resetPlayback();
    this.episodes.set([]);

    try {
      const media = await firstValueFrom(this.api.getMetadata(id));
      this.media.set(media);

      const first = this.providers()[0];
      if (first) await this.selectProvider(first);
    } catch (err) {
      this.mediaError.set(errorMessage(err));
    }
  }

  async selectProvider(provider: string): Promise<void> {
    this.provider.set(provider);
    this.servers.set([]);
    this.server.set('');

    // Danh sách server là tùy chọn, lỗi thì dùng server mặc định.
    try {
      const res = await firstValueFrom(this.api.getServers(this.media()!.id, provider));
      this.servers.set(res.servers ?? []);
      this.server.set(res.servers?.[0] ?? '');
    } catch {
      /* ignore */
    }

    await this.loadEpisodes();
  }

  async selectServer(server: string): Promise<void> {
    this.server.set(server);
    await this.loadEpisodes();
  }

  async loadEpisodes(): Promise<void> {
    this.episodesLoading.set(true);
    this.episodesError.set(null);
    this.episodes.set([]);

    try {
      const res = await firstValueFrom(
        this.api.getEpisodes(this.media()!.id, this.provider(), this.server() || undefined),
      );
      this.episodes.set(res.episodes ?? []);
    } catch (err) {
      this.episodesError.set(errorMessage(err));
    } finally {
      this.episodesLoading.set(false);
    }
  }

  async play(ep: Episode): Promise<void> {
    this.resetPlayback();
    this.currentEpisode.set(ep);
    this.sourceLoading.set(true);

    try {
      const src = await firstValueFrom(
        this.api.getSource(ep.episodeId, this.provider(), this.server() || ep.server),
      );
      this.source.set(src);
    } catch (err) {
      this.playerError.set(errorMessage(err));
    } finally {
      this.sourceLoading.set(false);
    }
  }

  onPlaybackError(message: string): void {
    this.playerError.set(
      this.useProxy() ? message : `${message}. Thử tick “Luôn dùng proxy” rồi bấm lại tập.`,
    );
  }

  toggleProxy(event: Event): void {
    this.forceProxy.set((event.target as HTMLInputElement).checked);
    this.playerError.set(null);
  }

  private resetPlayback(): void {
    this.currentEpisode.set(null);
    this.source.set(null);
    this.playerError.set(null);
  }
}
