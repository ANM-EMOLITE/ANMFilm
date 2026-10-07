import { Injectable, computed, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { Episode, MediaDetail, StreamSource } from '@core/models/api.models';
import { AnimeApi, REQUEST_TIMEOUT } from '@core/services/anime-api';
import { errorMessage, pickTitle } from '@core/utils/media.utils';

/** Một nguồn phát = provider + server ('' = server mặc định). */
interface Candidate {
  provider: string;
  server: string;
  status: 'idle' | 'loading' | 'ok' | 'error';
  episodes?: Episode[];
}

export type Phase = 'idle' | 'loading' | 'playing' | 'failed';

/** Lưới an toàn nếu player không báo gì (ms). */
const PLAYER_WATCHDOG_MS = 35_000;

const keyOf = (provider: string, server: string) => `${provider}|${server}`;

/**
 * Trạng thái + logic trang xem phim. Nguồn phát được chọn & đổi HOÀN TOÀN TỰ ĐỘNG, không hiển thị cho người xem:
 *
 * 1. Mở trang → lần lượt thử provider → server cho tới khi lấy được danh sách tập (danh sách này giữ cố định).
 * 2. Bấm tập → thử nguồn đang dùng; lỗi API (504, timeout, mạng…) hoặc player lỗi/treo
 *    → thử lại qua proxy → server khác → provider khác (cùng số tập).
 * 3. Đang xem mà video lỗi → tự đổi nguồn và phát tiếp từ đúng vị trí cũ.
 */
@Injectable()
export class WatchStore {
  private readonly api = inject(AnimeApi);

  // ---------- Media ----------
  readonly media = signal<MediaDetail | null>(null);
  readonly mediaError = signal<string | null>(null);
  readonly title = computed(() => pickTitle(this.media()?.titles));

  // ---------- Danh sách tập ----------
  readonly loadingList = signal(false);
  readonly hasProviders = computed(() => Object.keys(this.media()?.streamingProviders ?? {}).length > 0);
  /** Danh sách tập = gộp từ mọi nguồn (theo số tập), sắp xếp tăng dần. */
  readonly episodes = computed(() => {
    const byNumber = new Map<string, Episode>();
    for (const c of Object.values(this.candidates())) {
      for (const e of c.episodes ?? []) {
        const k = episodeKey(e.episodeNumber);
        if (!byNumber.has(k)) byNumber.set(k, e);
      }
    }
    return [...byNumber.values()].sort(compareEpisodes);
  });

  // ---------- Phát ----------
  readonly episodeNumber = signal<string | null>(null);
  readonly source = signal<StreamSource | null>(null);
  readonly proxied = signal(false);
  readonly startAt = signal(0);
  readonly phase = signal<Phase>('idle');
  readonly playerError = signal<string | null>(null);

  readonly playUrl = computed(() => {
    const src = this.source();
    if (!src) return '';
    return this.proxied() ? this.api.buildProxyUrl(src.url, src.proxyHeaders) : src.url;
  });

  readonly episodeIndex = computed(() =>
    this.episodes().findIndex(e => sameEpisode(e.episodeNumber, this.episodeNumber())),
  );
  readonly hasPrev = computed(() => this.episodeIndex() > 0);
  readonly hasNext = computed(() => {
    const i = this.episodeIndex();
    return i >= 0 && i < this.episodes().length - 1;
  });

  // ---------- Nội bộ ----------
  private readonly providers = signal<string[]>([]);
  private readonly candidates = signal<Record<string, Candidate>>({});
  private readonly serversByProvider = new Map<string, Promise<string[]>>();
  /** Nguồn đang phát được – tập sau sẽ thử nguồn này trước. */
  private current: { provider: string; server: string } | null = null;
  /** Các nguồn đã hỏng với tập đang xem – bỏ qua khi tự đổi nguồn. */
  private readonly excluded = new Set<string>();
  /** Có request bị từ chối vì vượt rate limit trong lần phát gần nhất. */
  private rateLimited = false;
  /** Sau khi bấm "Thử lại": bỏ qua link stream đã cache. */
  private freshSources = false;
  private mediaToken = 0;
  private playToken = 0;
  private pendingOutcome?: (result: { ok: boolean; message?: string }) => void;
  private watchdog?: ReturnType<typeof setTimeout>;

  // =====================================================================
  //  Load media
  // =====================================================================
  async load(id: string, initialEpisode?: string | null): Promise<void> {
    const token = ++this.mediaToken;
    this.reset();

    try {
      const media = await firstValueFrom(this.api.getMetadata(id));
      if (token !== this.mediaToken) return;
      this.media.set(media);
      this.providers.set(sortProviders(media));
    } catch (err) {
      if (token === this.mediaToken) this.mediaError.set(errorMessage(err));
      return;
    }

    await this.loadEpisodeList(token);
    if (token !== this.mediaToken) return;

    if (initialEpisode && this.episodes().some(e => sameEpisode(e.episodeNumber, initialEpisode))) {
      void this.play(initialEpisode);
    }
  }

  /** Bỏ cache và tìm lại từ đầu. */
  async retry(): Promise<void> {
    const token = this.mediaToken;
    this.candidates.set({});
    this.serversByProvider.clear();
    this.excluded.clear();
    this.current = null;
    this.freshSources = true;
    const ep = this.episodeNumber();
    await this.loadEpisodeList(token);
    if (ep && token === this.mediaToken) void this.play(ep);
  }

  // =====================================================================
  //  Phát + tự đổi nguồn
  // =====================================================================
  async play(episodeNumber: string, startAt = 0): Promise<void> {
    const token = ++this.playToken;
    if (!sameEpisode(episodeNumber, this.episodeNumber())) this.excluded.clear();

    this.settle({ ok: false });
    this.episodeNumber.set(episodeNumber);
    this.source.set(null);
    this.playerError.set(null);
    this.startAt.set(startAt);
    this.phase.set('loading');
    this.rateLimited = false;

    for await (const c of this.candidateOrder(this.current ?? undefined)) {
      if (token !== this.playToken) return;
      const key = keyOf(c.provider, c.server);
      if (this.excluded.has(key)) continue;

      // 1. Tập tương ứng ở nguồn này
      if (!(await this.ensureEpisodes(c.provider, c.server))) continue;
      if (token !== this.playToken) return;

      const ep = this.candidates()[key].episodes!.find(e => sameEpisode(e.episodeNumber, episodeNumber));
      if (!ep) {
        this.excluded.add(key);
        continue;
      }

      // 2. Link stream
      let src = await this.fetchSource(ep, c);
      if (token !== this.playToken) return;
      if (!src) {
        this.excluded.add(key);
        continue;
      }

      // 3. Phát: trực tiếp trước, lỗi thì qua proxy.
      //    Link M3U8 cache của AniMapper (24h, tối đa 1000 bản) có thể đã bị xóa → lấy link mới 1 lần rồi thử lại.
      for (let attempt = 0; attempt < 2 && src; attempt++) {
        for (const proxied of proxyVariants(src)) {
          this.proxied.set(proxied);
          this.source.set(src);

          const result = await this.waitForPlayer();
          if (token !== this.playToken) return;

          if (result.ok) {
            this.current = c;
            this.freshSources = false;
            this.phase.set('playing');
            return;
          }
        }
        if (attempt > 0 || !isCachedM3u8(src.url)) break;
        this.source.set(null);
        src = await this.fetchSource(ep, c, true);
        if (token !== this.playToken) return;
      }

      this.excluded.add(key);
      this.source.set(null);
    }

    if (token !== this.playToken) return;
    this.source.set(null);
    this.phase.set('failed');
    this.playerError.set(
      this.rateLimited
        ? 'Máy chủ đang quá tải, vui lòng thử lại sau ít phút.'
        : 'Tập phim này hiện chưa xem được. Vui lòng thử lại sau.',
    );
  }

  playPrev(): void {
    const ep = this.episodes()[this.episodeIndex() - 1];
    if (ep) void this.play(ep.episodeNumber);
  }

  playNext(): void {
    const ep = this.episodes()[this.episodeIndex() + 1];
    if (ep) void this.play(ep.episodeNumber);
  }

  // ---------- Sự kiện từ player ----------
  onPlayerReady(): void {
    this.settle({ ok: true });
  }

  onPlayerError(message: string, currentTime = 0): void {
    if (this.pendingOutcome) {
      this.settle({ ok: false, message });
      return;
    }

    // Đang xem thì lỗi → loại nguồn hiện tại, phát tiếp từ vị trí cũ ở nguồn khác.
    const ep = this.episodeNumber();
    if (!this.current || !ep || this.phase() !== 'playing') return;
    this.excluded.add(keyOf(this.current.provider, this.current.server));
    this.current = null;
    void this.play(ep, currentTime);
  }

  // =====================================================================
  //  Nội bộ
  // =====================================================================

  private async fetchSource(ep: Episode, c: { provider: string; server: string }, fresh = false) {
    try {
      return await firstValueFrom(
        this.api.getSource(ep.episodeId, c.provider, c.server || ep.server, {
          fresh: fresh || this.freshSources,
          timeoutMs: isSlowProvider(c.provider) ? REQUEST_TIMEOUT.slowSource : REQUEST_TIMEOUT.source,
        }),
      );
    } catch (err) {
      if (isRateLimit(err)) this.rateLimited = true;
      return null;
    }
  }

  /** Tải song song danh sách tập của mọi provider (mỗi provider lấy server đầu tiên trả về được). */
  private async loadEpisodeList(token: number): Promise<void> {
    this.loadingList.set(true);
    await Promise.all(
      this.providers().map(async provider => {
        for (const server of await this.ensureServers(provider)) {
          if (token !== this.mediaToken) return;
          if (await this.ensureEpisodes(provider, server)) return;
        }
      }),
    );
    if (token === this.mediaToken) this.loadingList.set(false);
  }

  /** Duyệt nguồn theo thứ tự: bắt đầu từ `from`, rồi các server/provider còn lại (vòng tròn). */
  private async *candidateOrder(from?: { provider: string; server: string }) {
    const providers = this.providers();
    const start = from ? Math.max(0, providers.indexOf(from.provider)) : 0;
    const ordered = [...providers.slice(start), ...providers.slice(0, start)];

    for (const provider of ordered) {
      const servers = await this.ensureServers(provider);
      let list = servers;
      if (from && provider === from.provider) {
        const i = Math.max(0, servers.indexOf(from.server));
        list = [...servers.slice(i), ...servers.slice(0, i)];
      }
      for (const server of list) yield { provider, server };
    }
  }

  /** Danh sách server của provider (cache + gộp request trùng). Lỗi → dùng server mặc định. */
  private ensureServers(provider: string): Promise<string[]> {
    let request = this.serversByProvider.get(provider);
    if (!request) {
      request = firstValueFrom(this.api.getServers(this.media()!.id, provider)).then(
        res => (res.servers?.length ? res.servers : ['']),
        () => [''],
      );
      this.serversByProvider.set(provider, request);
    }
    return request;
  }

  /** Lấy (hoặc dùng cache) danh sách tập. Trả về true nếu có ít nhất 1 tập. */
  private async ensureEpisodes(provider: string, server: string): Promise<boolean> {
    const key = keyOf(provider, server);
    const existing = this.candidates()[key];
    if (existing?.episodes?.length) return true;
    if (existing?.status === 'error') return false;

    const token = this.mediaToken;
    this.patch(key, { provider, server, status: 'loading' });
    try {
      const res = await firstValueFrom(this.api.getEpisodes(this.media()!.id, provider, server || undefined));
      const episodes = res.episodes ?? [];
      if (token === this.mediaToken) this.patch(key, { status: episodes.length ? 'ok' : 'error', episodes });
      return episodes.length > 0;
    } catch (err) {
      // Bị rate limit không có nghĩa nguồn hỏng → để 'idle' cho lần sau thử lại.
      if (isRateLimit(err)) this.rateLimited = true;
      if (token === this.mediaToken) this.patch(key, { status: isRateLimit(err) ? 'idle' : 'error' });
      return false;
    }
  }

  private patch(key: string, patch: Partial<Candidate>): void {
    this.candidates.update(map => {
      const [provider, server] = key.split('|');
      const prev: Candidate = map[key] ?? { provider, server, status: 'idle' };
      return { ...map, [key]: { ...prev, ...patch } };
    });
  }

  private waitForPlayer(): Promise<{ ok: boolean; message?: string }> {
    return new Promise(resolve => {
      this.pendingOutcome = resolve;
      this.watchdog = setTimeout(() => this.settle({ ok: false }), PLAYER_WATCHDOG_MS);
    });
  }

  private settle(result: { ok: boolean; message?: string }): void {
    clearTimeout(this.watchdog);
    const resolve = this.pendingOutcome;
    this.pendingOutcome = undefined;
    resolve?.(result);
  }

  private reset(): void {
    this.playToken++;
    this.settle({ ok: false });
    this.media.set(null);
    this.mediaError.set(null);
    this.providers.set([]);
    this.candidates.set({});
    this.serversByProvider.clear();
    this.current = null;
    this.excluded.clear();
    this.episodeNumber.set(null);
    this.source.set(null);
    this.phase.set('idle');
    this.playerError.set(null);
  }
}

// ---------- Helpers ----------

/** EMBED: không cần proxy. CORS bắt buộc: chỉ proxy. Còn lại: thử trực tiếp → proxy. */
function proxyVariants(src: StreamSource): boolean[] {
  if (src.type === 'EMBED') return [false];
  if (src.corsProxyRequired) return [true];
  return [false, true];
}

/** Provider hay sập (nhất là buổi tối) → chỉ dùng khi các nguồn khác không có / lỗi. */
const LOW_PRIORITY_PROVIDERS = ['ANIMEVIETSUB'];

/** Nguồn ổn định trước, nguồn hay sập sau; cùng nhóm thì theo độ khớp (similarity) giảm dần. */
function sortProviders(media: MediaDetail): string[] {
  const penalty = (name: string) => (LOW_PRIORITY_PROVIDERS.includes(name.toUpperCase()) ? 1 : 0);
  return Object.entries(media.streamingProviders ?? {})
    .map(([name, m], index) => ({ name, index, score: m.similarity ?? 0 }))
    .sort((a, b) => penalty(a.name) - penalty(b.name) || b.score - a.score || a.index - b.index)
    .map(e => e.name);
}

function isSlowProvider(provider: string): boolean {
  return LOW_PRIORITY_PROVIDERS.includes(provider.toUpperCase());
}

/** URL dạng /api/v1/stream/source/m3u8/{cacheKey} – playlist được AniMapper cache tạm. */
function isCachedM3u8(url: string): boolean {
  return url.includes('/stream/source/m3u8/');
}

function isRateLimit(err: unknown): boolean {
  return !!err && typeof err === 'object' && 'code' in err && err.code === 'RATE_LIMITED';
}

function episodeKey(n: string): string {
  const x = Number(n.trim());
  return n.trim() !== '' && Number.isFinite(x) ? String(x) : n.trim();
}

/** Sắp theo số (kể cả tập trùng có hậu tố "1163_1", "1163_2"), rồi theo chuỗi. */
function compareEpisodes(a: Episode, b: Episode): number {
  const x = parseFloat(a.episodeNumber);
  const y = parseFloat(b.episodeNumber);
  if (Number.isFinite(x) && Number.isFinite(y) && x !== y) return x - y;
  if (Number.isFinite(x) !== Number.isFinite(y)) return Number.isFinite(x) ? -1 : 1;
  return a.episodeNumber.localeCompare(b.episodeNumber, undefined, { numeric: true });
}

/** So khớp số tập giữa các provider ("001" == "1", "12.5" == "12.50"). */
export function sameEpisode(a: string | null | undefined, b: string | null | undefined): boolean {
  if (a == null || b == null) return false;
  if (a === b) return true;
  const x = Number(a.trim());
  const y = Number(b.trim());
  return a.trim() !== '' && b.trim() !== '' && Number.isFinite(x) && x === y;
}
