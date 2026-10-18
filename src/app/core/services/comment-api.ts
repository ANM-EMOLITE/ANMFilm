import { HttpClient, HttpErrorResponse, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, catchError, throwError } from 'rxjs';
import { API_BASE_URL } from '../api.config';
import { AddCommentRequest, Comment, CommentPage } from '../models/user.models';

/** API bình luận. GET công khai; POST/DELETE cần đăng nhập (token gắn bởi userAuthInterceptor). */
@Injectable({ providedIn: 'root' })
export class CommentApi {
  private readonly http = inject(HttpClient);
  private readonly base = `${inject(API_BASE_URL)}/api/v1/comments`;

  list(animeId: number, limit = 30, offset = 0): Observable<CommentPage> {
    const params = new HttpParams().set('animeId', animeId).set('limit', limit).set('offset', offset);
    return this.wrap(this.http.get<CommentPage>(this.base, { params }));
  }

  add(body: AddCommentRequest): Observable<Comment> {
    return this.wrap(this.http.post<Comment>(this.base, body));
  }

  remove(id: number): Observable<void> {
    return this.wrap(this.http.delete<void>(`${this.base}/${id}`));
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
