import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, catchError, throwError } from 'rxjs';
import { API_BASE_URL } from '../api.config';
import {
  ActivityLog,
  AddWatchlistRequest,
  RecordWatchRequest,
  WatchHistoryEntry,
  WatchlistItem,
} from '../models/user.models';

/** API thư viện người xem (token gắn bởi userAuthInterceptor). Lỗi trả về chuỗi thông báo. */
@Injectable({ providedIn: 'root' })
export class UserApi {
  private readonly http = inject(HttpClient);
  private readonly base = `${inject(API_BASE_URL)}/api/v1/user`;

  // ----- Watchlist -----

  watchlist(): Observable<WatchlistItem[]> {
    return this.wrap(this.http.get<WatchlistItem[]>(`${this.base}/watchlist`));
  }

  watchlistIds(): Observable<number[]> {
    return this.wrap(this.http.get<number[]>(`${this.base}/watchlist/ids`));
  }

  addWatchlist(body: AddWatchlistRequest): Observable<WatchlistItem> {
    return this.wrap(this.http.post<WatchlistItem>(`${this.base}/watchlist`, body));
  }

  removeWatchlist(animeId: number): Observable<void> {
    return this.wrap(this.http.delete<void>(`${this.base}/watchlist/${animeId}`));
  }

  // ----- Lịch sử xem -----

  recordWatch(body: RecordWatchRequest): Observable<WatchHistoryEntry> {
    return this.wrap(this.http.post<WatchHistoryEntry>(`${this.base}/history`, body));
  }

  history(limit = 30): Observable<WatchHistoryEntry[]> {
    return this.wrap(this.http.get<WatchHistoryEntry[]>(`${this.base}/history`, { params: { limit } }));
  }

  // ----- Nhật ký hoạt động -----

  activity(limit = 50): Observable<ActivityLog[]> {
    return this.wrap(this.http.get<ActivityLog[]>(`${this.base}/activity`, { params: { limit } }));
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
