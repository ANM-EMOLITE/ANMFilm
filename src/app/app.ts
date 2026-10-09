import { Component, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { filter, map } from 'rxjs';
import { SearchBox } from '@shared/components/search-box/search-box';
import { UiIcon, UiToaster } from '@shared/ui';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, SearchBox, UiIcon, UiToaster],
  templateUrl: './app.html',
  styleUrl: './app.scss',
  host: { '(window:scroll)': 'onScroll()' },
})
export class App {
  private readonly router = inject(Router);

  protected readonly scrolled = signal(false);

  /** Trang /admin có khung riêng → ẩn header/footer của trang xem phim. */
  protected readonly isAdmin = toSignal(
    this.router.events.pipe(
      filter(e => e instanceof NavigationEnd),
      map(() => this.router.url.startsWith('/admin')),
    ),
    { initialValue: location.pathname.startsWith('/admin') },
  );

  protected onScroll(): void {
    this.scrolled.set(window.scrollY > 8);
  }
}
