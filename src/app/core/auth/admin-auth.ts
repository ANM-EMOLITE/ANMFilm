import { HttpClient, HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { Observable, catchError, tap, throwError } from 'rxjs';
import { API_BASE_URL } from '../api.config';
import { LoginResponse } from '../models/admin.models';

const STORAGE_KEY = 'anime-admin-session';

interface Session {
  token: string;
  username: string;
  expiresAt: string;
}

/** Phiên đăng nhập admin (JWT), lưu ở localStorage để F5 không bị đăng xuất. */
@Injectable({ providedIn: 'root' })
export class AdminAuth {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);
  private readonly baseUrl = inject(API_BASE_URL);

  private readonly session = signal<Session | null>(readSession());

  readonly username = computed(() => this.session()?.username ?? null);
  readonly token = computed(() => this.session()?.token ?? null);

  isLoggedIn(): boolean {
    const s = this.session();
    if (!s) return false;
    if (Date.parse(s.expiresAt) <= Date.now()) {
      this.clear();
      return false;
    }
    return true;
  }

  login(username: string, password: string): Observable<LoginResponse> {
    return this.http
      .post<LoginResponse>(`${this.baseUrl}/api/v1/admin/auth/login`, { username, password })
      .pipe(
        tap(res => this.save({ token: res.token, username: res.username, expiresAt: res.expiresAt })),
        catchError((err: HttpErrorResponse) => throwError(() => toMessage(err))),
      );
  }

  changePassword(currentPassword: string, newPassword: string): Observable<void> {
    return this.http
      .post<void>(`${this.baseUrl}/api/v1/admin/auth/change-password`, { currentPassword, newPassword })
      .pipe(catchError((err: HttpErrorResponse) => throwError(() => toMessage(err))));
  }

  logout(returnUrl?: string): void {
    this.clear();
    this.router.navigate(['/admin/login'], { queryParams: returnUrl ? { returnUrl } : {} });
  }

  private save(session: Session): void {
    this.session.set(session);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
    } catch {
      // Trình duyệt chặn storage → chỉ giữ phiên trong tab hiện tại.
    }
  }

  private clear(): void {
    this.session.set(null);
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
  }
}

function readSession(): Session | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const s = raw ? (JSON.parse(raw) as Session) : null;
    return s?.token && Date.parse(s.expiresAt) > Date.now() ? s : null;
  } catch {
    return null;
  }
}

function toMessage(err: HttpErrorResponse): string {
  if (err.status === 0) return 'Không kết nối được BE (đã chạy Anime.Api chưa?)';
  return (err.error as { message?: string } | null)?.message ?? err.message;
}

/** Gắn `Authorization: Bearer` cho API admin; token hết hạn / sai (401) → về trang đăng nhập. */
export const adminAuthInterceptor: HttpInterceptorFn = (req, next) => {
  if (!req.url.includes('/api/v1/admin/') || req.url.endsWith('/admin/auth/login')) return next(req);

  const auth = inject(AdminAuth);
  const router = inject(Router);
  const token = auth.token();

  return next(token ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } }) : req).pipe(
    catchError((err: HttpErrorResponse) => {
      if (err.status === 401) auth.logout(router.url);
      return throwError(() => err);
    }),
  );
};

/** Chặn các trang /admin khi chưa đăng nhập. */
export const adminGuard: CanActivateFn = (_, state) => {
  const auth = inject(AdminAuth);
  return auth.isLoggedIn()
    ? true
    : inject(Router).createUrlTree(['/admin/login'], { queryParams: { returnUrl: state.url } });
};
