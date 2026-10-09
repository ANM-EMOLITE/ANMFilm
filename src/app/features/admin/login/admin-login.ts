import { ChangeDetectionStrategy, Component, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AdminAuth } from '@core/auth/admin-auth';
import { UiButton, UiIcon, UiSpinner } from '@shared/ui';

@Component({
  selector: 'app-admin-login',
  imports: [FormsModule, UiButton, UiIcon, UiSpinner],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <main class="wrap">
      <form class="card box" (ngSubmit)="submit()">
        <div class="head">
          <span class="logo"><ui-icon name="shield" [size]="22" /></span>
          <h1>Quản trị Anime<b>Stream</b></h1>
          <p class="text-muted">Đăng nhập để đồng bộ và quản lý danh mục phim.</p>
        </div>

        <label class="ui-field">
          <span>Tên đăng nhập</span>
          <input class="ui-input" name="username" autocomplete="username" required autofocus
                 [(ngModel)]="username" [disabled]="loading()" />
        </label>

        <label class="ui-field">
          <span>Mật khẩu</span>
          <div class="pw">
            <input class="ui-input" name="password" autocomplete="current-password" required
                   [type]="showPassword() ? 'text' : 'password'"
                   [(ngModel)]="password" [disabled]="loading()" />
            <button type="button" class="eye" [attr.aria-label]="showPassword() ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'"
                    (click)="showPassword.set(!showPassword())">
              <ui-icon [name]="showPassword() ? 'eye-off' : 'eye'" [size]="16" />
            </button>
          </div>
        </label>

        @if (error()) {
          <p class="error" role="alert"><ui-icon name="alert" [size]="14" /> {{ error() }}</p>
        }

        <button uiBtn size="lg" block type="submit" [disabled]="loading() || !username || !password">
          @if (loading()) { <ui-spinner [size]="16" /> Đang đăng nhập… } @else { <ui-icon name="lock" [size]="16" /> Đăng nhập }
        </button>
      </form>
    </main>
  `,
  styles: `
    .wrap { min-height: 100vh; display: grid; place-items: center; padding: 24px 16px; }
    .box { width: min(400px, 100%); padding: 32px 28px; display: grid; gap: 18px; box-shadow: var(--shadow-lg); }
    .head { display: grid; justify-items: center; gap: 8px; text-align: center; margin-bottom: 4px; }
    .logo {
      display: grid; place-items: center; width: 48px; height: 48px; border-radius: 14px;
      background: var(--accent-gradient); color: #fff; box-shadow: 0 8px 22px rgb(255 92 138 / .35);
    }
    h1 {
      font-size: 20px; font-weight: 600;
      b { font-weight: 800; background: var(--accent-gradient); -webkit-background-clip: text; background-clip: text; color: transparent; }
    }
    p { font-size: 13px; }
    .pw { position: relative; .ui-input { padding-right: 42px; } }
    .eye {
      position: absolute; top: 50%; right: 6px; transform: translateY(-50%);
      display: grid; place-items: center; width: 30px; height: 30px; border: 0; border-radius: 6px;
      background: none; color: var(--muted); cursor: pointer;
      &:hover { color: var(--text); background: var(--surface-3); }
    }
    .error {
      display: flex; align-items: center; gap: 8px; padding: 10px 12px; border-radius: var(--radius-sm);
      background: var(--danger-soft); color: var(--danger); font-size: 13px;
    }
  `,
})
export class AdminLogin {
  private readonly auth = inject(AdminAuth);
  private readonly router = inject(Router);

  /** Từ query param ?returnUrl= (component input binding). */
  readonly returnUrl = input<string>();

  protected username = '';
  protected password = '';
  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly showPassword = signal(false);

  constructor() {
    if (this.auth.isLoggedIn()) this.router.navigateByUrl('/admin');
  }

  submit(): void {
    if (this.loading() || !this.username || !this.password) return;

    this.loading.set(true);
    this.error.set(null);
    this.auth.login(this.username.trim(), this.password).subscribe({
      next: () => {
        const target = this.returnUrl();
        this.router.navigateByUrl(target?.startsWith('/admin') ? target : '/admin');
      },
      error: (message: string) => {
        this.loading.set(false);
        this.error.set(message);
        this.password = '';
      },
    });
  }
}
