import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AdminAuth } from '@core/auth/admin-auth';
import { IconName, UiButton, UiIcon } from '@shared/ui';

interface NavItem {
  path: string;
  label: string;
  icon: IconName;
}

/** Khung trang admin: thanh bên + nội dung. */
@Component({
  selector: 'app-admin-layout',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, UiButton, UiIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <aside class="side">
      <a class="brand" routerLink="/admin">
        <span class="logo"><ui-icon name="shield" [size]="16" /></span>
        <span>Anime<b>Emolite</b></span>
      </a>

      <nav>
        @for (item of nav; track item.path) {
          <a [routerLink]="item.path" routerLinkActive="active" [routerLinkActiveOptions]="{ exact: true }">
            <ui-icon [name]="item.icon" [size]="17" /> {{ item.label }}
          </a>
        }
        <a routerLink="/" class="muted"><ui-icon name="tv" [size]="17" /> Xem trang web</a>
      </nav>

      <div class="me">
        <span class="avatar"><ui-icon name="user" [size]="15" /></span>
        <span class="name">{{ auth.username() }}</span>
        <button uiBtn variant="ghost" size="sm" iconOnly aria-label="Đăng xuất" title="Đăng xuất" (click)="auth.logout()">
          <ui-icon name="logout" [size]="16" />
        </button>
      </div>
    </aside>

    <main class="content">
      <router-outlet />
    </main>
  `,
  styles: `
    :host { display: grid; grid-template-columns: 240px 1fr; min-height: 100vh; }
    .side {
      position: sticky; top: 0; height: 100vh; display: flex; flex-direction: column; gap: 24px;
      padding: 20px 14px; background: var(--bg-elevated); border-right: 1px solid var(--line);
    }
    .brand {
      display: flex; align-items: center; gap: 10px; padding: 0 8px; text-decoration: none; font-size: 16px;
      b { font-weight: 800; background: var(--accent-gradient); -webkit-background-clip: text; background-clip: text; color: transparent; }
    }
    .logo { display: grid; place-items: center; width: 32px; height: 32px; border-radius: 10px; background: var(--accent-gradient); color: #fff; }
    nav { display: grid; gap: 4px; }
    nav a {
      display: flex; align-items: center; gap: 10px; padding: 9px 12px; border-radius: var(--radius-sm);
      color: var(--text-2); text-decoration: none; font-weight: 500;
      transition: background var(--dur), color var(--dur);
      &:hover { background: var(--surface-2); color: var(--text); }
      &.active { background: var(--accent-soft); color: var(--text); }
      &.muted { color: var(--muted); margin-top: 8px; }
    }
    .me {
      margin-top: auto; display: flex; align-items: center; gap: 10px; padding: 10px;
      border: 1px solid var(--line); border-radius: var(--radius);
    }
    .avatar { display: grid; place-items: center; width: 30px; height: 30px; border-radius: 50%; background: var(--surface-3); color: var(--text-2); }
    .name { flex: 1; min-width: 0; font-weight: 600; overflow: hidden; text-overflow: ellipsis; }
    .content { min-width: 0; padding: 28px clamp(16px, 3vw, 36px) 48px; }

    @media (max-width: 860px) {
      :host { grid-template-columns: 1fr; }
      .side { position: static; height: auto; flex-direction: row; flex-wrap: wrap; align-items: center; gap: 12px; padding: 12px 16px; border-right: 0; border-bottom: 1px solid var(--line); }
      nav { display: flex; flex-wrap: wrap; }
      nav a.muted { margin-top: 0; }
      .me { margin-top: 0; margin-left: auto; padding: 4px 6px; border: 0; }
    }
  `,
})
export class AdminLayout {
  protected readonly auth = inject(AdminAuth);

  protected readonly nav: NavItem[] = [
    { path: '/admin', label: 'Tổng quan & đồng bộ', icon: 'grid' },
    { path: '/admin/anime', label: 'Quản lý phim', icon: 'film' },
  ];
}
