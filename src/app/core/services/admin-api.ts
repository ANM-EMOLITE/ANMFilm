import { HttpClient, HttpErrorResponse, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, catchError, throwError } from 'rxjs';
import { API_BASE_URL } from '../api.config';
import {
  AdminAnime,
  AdminAnimePage,
  AdminAnimeQuery,
  AdminStats,
  SyncAnimeResult,
  SyncJob,
} from '../models/admin.models';
import { BrowseTab } from '../models/api.models';

/** API quản trị (token được gắn bởi adminAuthInterceptor). Lỗi trả về dạng chuỗi thông báo. */
@Injectable({ providedIn: 'root' })
export class AdminApi {
  private readonly http = inject(HttpClient);
  private readonly base = `${inject(API_BASE_URL)}/api/v1/admin`;

  stats(): Observable<AdminStats> {
    return this.wrap(this.http.get<AdminStats>(`${this.base}/stats`));
  }

  listAnime(query: AdminAnimeQuery): Observable<AdminAnimePage> {
    let params = new HttpParams();
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== null && value !== '') params = params.set(key, String(value));
    }
    return this.wrap(this.http.get<AdminAnimePage>(`${this.base}/anime`, { params }));
  }

  setHidden(id: number, isHidden: boolean): Observable<AdminAnime> {
    return this.wrap(this.http.patch<AdminAnime>(`${this.base}/anime/${id}`, { isHidden }));
  }

  syncAnime(id: number): Observable<SyncAnimeResult> {
    return this.wrap(this.http.post<SyncAnimeResult>(`${this.base}/anime/${id}/sync`, {}));
  }

  startSync(lists: BrowseTab[], updateExisting: boolean): Observable<SyncJob> {
    return this.wrap(this.http.post<SyncJob>(`${this.base}/sync`, { lists, updateExisting }));
  }

  /** Lưu sẵn link stream mọi tập của 1 phim vào DB (chạy nền). force: lấy lại cả tập đã có. */
  prefetchStreams(id: number, force = false): Observable<SyncJob> {
    return this.wrap(this.http.post<SyncJob>(`${this.base}/anime/${id}/streams`, {}, { params: { force } }));
  }

  /** Kiểm tra nguồn phát 1 phim (chạy nền): provider lỗi tự tắt, không còn provider chạy thì tự ẩn. */
  checkAnime(id: number): Observable<SyncJob> {
    return this.wrap(this.http.post<SyncJob>(`${this.base}/anime/${id}/check`, {}));
  }

  /** Kiểm tra nguồn phát hàng loạt theo tab. force: kiểm tra lại cả phim đã kiểm tra trong 24h. */
  startHealthCheck(lists: BrowseTab[], force: boolean): Observable<SyncJob> {
    return this.wrap(this.http.post<SyncJob>(`${this.base}/health`, { lists, force }));
  }

  setProviderDisabled(id: number, provider: string, isDisabled: boolean): Observable<AdminAnime> {
    return this.wrap(this.http.patch<AdminAnime>(`${this.base}/anime/${id}/providers/${provider}`, { isDisabled }));
  }

  jobs(limit = 10): Observable<SyncJob[]> {
    return this.wrap(this.http.get<SyncJob[]>(`${this.base}/sync/jobs`, { params: { limit } }));
  }

  job(id: string): Observable<SyncJob> {
    return this.wrap(this.http.get<SyncJob>(`${this.base}/sync/jobs/${id}`));
  }

  private wrap<T>(source: Observable<T>): Observable<T> {
    return source.pipe(
      catchError((err: HttpErrorResponse) =>
        throwError(() =>
          err.status === 0
            ? 'Không kết nối được BE (đã chạy Anime.Api chưa?)'
            : ((err.error as { message?: string } | null)?.message ?? err.message),
        ),
      ),
    );
  }
}
