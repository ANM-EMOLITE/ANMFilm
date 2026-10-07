import { HttpClient, HttpErrorResponse, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, catchError, map, throwError } from 'rxjs';
import { API_BASE_URL } from '../api.config';
import {
  ApiError,
  AutocompleteResponse,
  BrowseParams,
  EpisodesResponse,
  MediaDetail,
  MetadataResponse,
  SearchParams,
  SearchResponse,
  ServersResponse,
  StreamSource,
} from '../models/api.models';

type QueryValue = string | number | boolean | null | undefined;

@Injectable({ providedIn: 'root' })
export class AnimeApi {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = inject(API_BASE_URL);

  // ---------- Search ----------
  search(params: SearchParams): Observable<SearchResponse> {
    return this.get<SearchResponse>('search', { ...params });
  }

  /** Danh sách theo tab (chỉ anime đã có nguồn phát). Trang sau: offset = nextOffset. */
  browse(params: BrowseParams): Observable<SearchResponse> {
    return this.get<SearchResponse>('browse', { ...params });
  }

  autocomplete(q: string, limit = 8, mediaType: 'ANIME' | 'MANGA' = 'ANIME'): Observable<AutocompleteResponse> {
    return this.get<AutocompleteResponse>('autocomplete', { q, limit, mediaType });
  }

  // ---------- Metadata ----------
  getMetadata(id: number | string): Observable<MediaDetail> {
    return this.get<MetadataResponse>('metadata', { id }).pipe(map(r => r.result));
  }

  // ---------- Streaming ----------
  getServers(id: number, provider: string): Observable<ServersResponse> {
    return this.get<ServersResponse>('stream/episodes/servers', { id, provider });
  }

  /** limit = 0 => lấy tất cả tập */
  getEpisodes(id: number, provider: string, server?: string, limit = 0, offset = 0): Observable<EpisodesResponse> {
    return this.get<EpisodesResponse>('stream/episodes', { id, provider, server, limit, offset });
  }

  getSource(episodeData: string, provider: string, server?: string): Observable<StreamSource> {
    return this.get<StreamSource>('stream/source', { episodeData, provider, server });
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
  private get<T>(path: string, query: Record<string, QueryValue> = {}): Observable<T> {
    let params = new HttpParams();
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== null && value !== '') {
        params = params.set(key, String(value));
      }
    }

    return this.http
      .get<T>(`${this.baseUrl}/api/v1/${path}`, { params })
      .pipe(catchError((err: HttpErrorResponse) => throwError(() => toApiError(err))));
  }
}

/** Chuẩn hóa lỗi HTTP về dạng { success, message, code } của BE. */
function toApiError(err: HttpErrorResponse): ApiError {
  const body = err.error as Partial<ApiError> | null;
  if (body && typeof body === 'object' && body.message) {
    return { success: false, message: body.message, code: body.code ?? `HTTP_${err.status}` };
  }
  return {
    success: false,
    message: err.status === 0 ? 'Không kết nối được BE (đã chạy Anime.Api chưa?)' : err.message,
    code: err.status === 0 ? 'NETWORK_ERROR' : `HTTP_${err.status}`,
  };
}

function toBase64Url(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  bytes.forEach(b => (binary += String.fromCharCode(b)));
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
