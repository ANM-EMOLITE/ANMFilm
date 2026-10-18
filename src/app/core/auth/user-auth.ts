import { HttpClient, HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { Observable, catchError, tap, throwError } from 'rxjs';
import { API_BASE_URL } from '../api.config';
import { RegisterRequest, UserAuthResponse, UserProfile } from '../models/user.models';

const STORAGE_KEY = 'anime-user-session';

interface Session {
  token: string;
  expiresAt: string;
  user: UserProfile;
}

/** Phiên đăng nhập của người xem (JWT role "user"), lưu ở localStorage. Tách biệt với phiên admin. */
@Injectable({ providedIn: 'root' })
export class UserAuth {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);
  private readonly baseUrl = inject(API_BASE_URL);

  private readonly session = signal<Session | null>(readSession());

  readonly user = computed(() => this.session()?.user ?? null);
  readonly token = computed(() => this.session()?.token ?? null);
  readonly isLoggedIn = computed(() => {
    const s = this.session();
    return !!s && Date.parse(s.expiresAt) > Date.now();
  });

  register(body: RegisterRequest): Observable<UserAuthResponse> {
    return this.http
      .post<UserAuthResponse>(`${this.baseUrl}/api/v1/user/auth/register`, body)
      .pipe(
        tap(res => this.save(res)),
        catchError((err: HttpErrorResponse) => throwError(() => toMessage(err))),
      );
  }

  login(usernameOrEmail: string, password: string): Observable<UserAuthResponse> {
    return this.http
      .post<UserAuthResponse>(`${this.baseUrl}/api/v1/user/auth/login`, { usernameOrEmail, password })
      .pipe(
        tap(res => this.save(res)),
        catchError((err: HttpErrorResponse) => throwError(() => toMessage(err))),
      );
  }

  logout(returnUrl?: string): void {
    this.clear();
    this.router.navigate(['/login'], { queryParams: returnUrl ? { returnUrl } : {} });
  }

  private save(res: UserAuthResponse): void {
    const session: Session = { token: res.token, expiresAt: res.expiresAt, user: res.user };
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

/** Gắn `Authorization: Bearer` cho API người xem; 401 → đăng xuất. */
export const userAuthInterceptor: HttpInterceptorFn = (req, next) => {
  const isUserApi = req.url.includes('/api/v1/user/') && !req.url.includes('/api/v1/user/auth/');
  // Bình luận: GET công khai, nhưng gắn token (nếu có) để POST/DELETE hoạt động.
  const isCommentApi = req.url.includes('/api/v1/comments');
  if (!isUserApi && !isCommentApi) return next(req);

  const auth = inject(UserAuth);
  const router = inject(Router);
  const token = auth.token();

  return next(token ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } }) : req).pipe(
    catchError((err: HttpErrorResponse) => {
      if (err.status === 401) auth.logout(router.url);
      return throwError(() => err);
    }),
  );
};

/** Chặn trang cần đăng nhập (vd: /account). */
export const userGuard: CanActivateFn = (_, state) => {
  const auth = inject(UserAuth);
  return auth.isLoggedIn()
    ? true
    : inject(Router).createUrlTree(['/login'], { queryParams: { returnUrl: state.url } });
};
