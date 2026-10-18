import { HttpClient, HttpErrorResponse, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, TimeoutError, catchError, map, of, retry, shareReplay, throwError, timeout, timer } from 'rxjs';
import { API_BASE_URL } from '../api.config';
import {
  ApiError,
  AutocompleteResponse,
  BrowseParams,
  EpisodesResponse,
  MediaDetail,
  MediaSearchResult,
  MetadataResponse,
  SearchParams,
  SearchResponse,
  ServersResponse,
  StreamSource,
} from '../models/api.models';

type QueryValue = string | number | boolean | null | undefined;

/** Thời gian chờ tối đa (ms) cho từng loại request trước khi coi là lỗi. */
export const REQUEST_TIMEOUT = {
  default: 20_000,
  servers: 10_000,
  episodes: 15_000,
  source: 15_000,
  /** Nguồn phải giải mã M3U8 phía server (vd ANIMEVIETSUB server DU) → chậm hơn hẳn. */
  slowSource: 35_000,
} as const;

/** Thời gian cache phía client (ms) – AniMapper giới hạn 60 request/phút nên hạn chế gọi lặp. */
const CACHE_TTL = {
  metadata: 10 * 60_000,
  list: 5 * 60_000,
  servers: 30 * 60_000,
  episodes: 10 * 60_000,
  source: 3 * 60_000,
} as const;

/** Bị 429: chờ theo Retry-After (tối đa 8s) rồi thử lại 1 lần (BE đã tự điều tiết & chờ trước khi trả 429). */
const RATE_LIMIT_RETRIES = 1;
const RATE_LIMIT_MAX_WAIT_MS = 8_000;

interface GetOptions {
  timeoutMs?: number;
  cacheMs?: number;
}

@Injectable({ providedIn: 'root' })
export class AnimeApi {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = inject(API_BASE_URL);
  private readonly cache = new Map<string, { expires: number; response: Observable<unknown> }>();

  // ---------- Search ----------
  search(params: SearchParams): Observable<SearchResponse> {
    return this.get<SearchResponse>('search', { ...params }, { cacheMs: CACHE_TTL.list });
  }

  /** Danh sách theo tab (chỉ anime đã có nguồn phát). Trang sau: offset = nextOffset. */
  browse(params: BrowseParams): Observable<SearchResponse> {
    return this.get<SearchResponse>('browse', { ...params }, { cacheMs: CACHE_TTL.list });
  }

  autocomplete(q: string, limit = 8, mediaType: 'ANIME' | 'MANGA' = 'ANIME'): Observable<AutocompleteResponse> {
    return this.get<AutocompleteResponse>(
      'autocomplete',
      { q, limit, mediaType },
      { timeoutMs: 8_000, cacheMs: CACHE_TTL.list },
    );
  }

  // ---------- Metadata ----------
  getMetadata(id: number | string): Observable<MediaDetail> {
    return this.get<MetadataResponse>('metadata', { id }, { cacheMs: CACHE_TTL.metadata }).pipe(map(r => r.result));
  }

  /** Metadata rút gọn của nhiều phim (dùng cho "Phần liên quan"). */
  metadataBatch(ids: number[]): Observable<MediaSearchResult[]> {
    if (!ids.length) return of([]);
    return this.get<{ results: MediaSearchResult[] }>(
      'metadata/batch',
      { ids: ids.join(',') },
      { cacheMs: CACHE_TTL.metadata },
    ).pipe(map(r => r.results ?? []));
  }

  // ---------- Streaming ----------
  getServers(id: number, provider: string): Observable<ServersResponse> {
    return this.get<ServersResponse>(
      'stream/episodes/servers',
      { id, provider },
      { timeoutMs: REQUEST_TIMEOUT.servers, cacheMs: CACHE_TTL.servers },
    );
  }

  /** limit = 0 => lấy tất cả tập */
  getEpisodes(id: number, provider: string, server?: string, limit = 0, offset = 0): Observable<EpisodesResponse> {
    return this.get<EpisodesResponse>(
      'stream/episodes',
      { id, provider, server, limit, offset },
      { timeoutMs: REQUEST_TIMEOUT.episodes, cacheMs: CACHE_TTL.episodes },
    );
  }

  /** `fresh = true`: bỏ qua cache (link cũ đã hỏng, cần link mới). */
  getSource(
    episodeData: string,
    provider: string,
    server?: string,
    options: { timeoutMs?: number; fresh?: boolean } = {},
  ): Observable<StreamSource> {
    const query = { episodeData, provider, server };
    if (options.fresh) this.cache.delete(cacheKey('stream/source', query));
    // refresh=true: BE bỏ qua cache của nó và lấy link mới từ AniMapper.
    return this.get<StreamSource>('stream/source', { ...query, refresh: options.fresh || undefined }, {
      timeoutMs: options.timeoutMs ?? REQUEST_TIMEOUT.source,
      cacheMs: CACHE_TTL.source,
    });
  }

  /**
   * URL đi qua proxy của BE (BE gửi kèm proxyHeaders như Referer, trình duyệt không tự gửi được).
   * Dùng cho HLS/DIRECT khi corsProxyRequired = true.
   */
  buildProxyUrl(url: string, headers?: Record<string, string> | null): string {
    const params = new URLSearchParams({ url });
    if (headers && Object.keys(headers).length) {
      params.set('h', toBase64Url(JSON.stringify(headers)));
    }
    return `${this.baseUrl}/api/v1/stream/proxy?${params}`;
  }

  // ---------- Helpers ----------
  private get<T>(path: string, query: Record<string, QueryValue> = {}, options: GetOptions = {}): Observable<T> {
    const ms = options.timeoutMs ?? REQUEST_TIMEOUT.default;
    const key = cacheKey(path, query);

    if (options.cacheMs) {
      const hit = this.cache.get(key);
      if (hit && hit.expires > Date.now()) return hit.response as Observable<T>;
    }

    let params = new HttpParams();
    for (const [k, value] of Object.entries(query)) {
      if (value !== undefined && value !== null && value !== '') params = params.set(k, String(value));
    }

    const entry = { expires: Date.now() + (options.cacheMs ?? 0), response: null as unknown as Observable<unknown> };
    let request = this.http.get<T>(`${this.baseUrl}/api/v1/${path}`, { params }).pipe(
      timeout(ms),
      retry({
        count: RATE_LIMIT_RETRIES,
        delay: err => {
          const wait = rateLimitWait(err);
          return wait === null ? throwError(() => err) : timer(wait);
        },
      }),
      catchError((err: unknown) => {
        if (this.cache.get(key) === entry) this.cache.delete(key); // không cache lỗi
        return throwError(() => toApiError(err, ms));
      }),
    );

    if (options.cacheMs) {
      request = request.pipe(shareReplay({ bufferSize: 1, refCount: false }));
      entry.response = request;
      this.cache.set(key, entry);
      if (this.cache.size > 300) this.pruneCache();
    }
    return request;
  }

  private pruneCache(): void {
    const now = Date.now();
    for (const [k, v] of this.cache) if (v.expires <= now) this.cache.delete(k);
  }
}

function cacheKey(path: string, query: Record<string, QueryValue>): string {
  const parts = Object.entries(query)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => `${k}=${v}`)
    .sort();
  return `${path}?${parts.join('&')}`;
}

/** Lỗi do vượt rate limit (429 trực tiếp, hoặc BE báo lại lỗi 429 từ AniMapper). */
function isRateLimited(err: unknown): boolean {
  if (!(err instanceof HttpErrorResponse)) return false;
  if (err.status === 429) return true;
  const body = err.error as { message?: string } | null;
  return typeof body?.message === 'string' && /\b429\b|rate limit|too many requests/i.test(body.message);
}

/** ms cần chờ trước khi thử lại; null = không phải lỗi rate limit. */
function rateLimitWait(err: unknown): number | null {
  if (!isRateLimited(err)) return null;
  const header = Number((err as HttpErrorResponse).headers?.get('Retry-After'));
  const seconds = Number.isFinite(header) && header > 0 ? header : 3;
  return Math.min(seconds * 1000, RATE_LIMIT_MAX_WAIT_MS);
}

/** Chuẩn hóa lỗi HTTP/timeout về dạng { success, message, code } của BE. */
function toApiError(err: unknown, ms: number): ApiError {
  if (err instanceof TimeoutError) {
    return { success: false, message: `Quá thời gian chờ (${ms / 1000}s)`, code: 'TIMEOUT' };
  }
  if (!(err instanceof HttpErrorResponse)) {
    return { success: false, message: String(err), code: 'UNKNOWN' };
  }
  if (isRateLimited(err)) {
    return { success: false, message: 'Máy chủ đang quá tải, vui lòng thử lại sau ít phút.', code: 'RATE_LIMITED' };
  }

  const body = err.error as Partial<ApiError> | null;
  if (body && typeof body === 'object' && body.message) {
    return { success: false, message: body.message, code: body.code ?? `HTTP_${err.status}` };
  }
  if (err.status === 0) {
    return { success: false, message: 'Không kết nối được máy chủ', code: 'NETWORK_ERROR' };
  }
  if (err.status === 504) {
    return { success: false, message: 'Máy chủ phản hồi quá lâu (504)', code: 'HTTP_504' };
  }
  return { success: false, message: err.message, code: `HTTP_${err.status}` };
}

function toBase64Url(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  bytes.forEach(b => (binary += String.fromCharCode(b)));
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
