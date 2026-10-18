import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, effect, inject, input, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { UserAuth } from '@core/auth/user-auth';
import { CommentApi } from '@core/services/comment-api';
import { Comment } from '@core/models/user.models';
import { ToastService, UiButton, UiEmptyState, UiIcon, UiSpinner } from '@shared/ui';

/** Khu vực bình luận của 1 phim (kèm tập đang xem lúc gửi). */
@Component({
  selector: 'app-comments-section',
  imports: [DatePipe, FormsModule, RouterLink, UiButton, UiEmptyState, UiIcon, UiSpinner],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="comments card">
      <h2 class="section-title"><ui-icon name="list" [size]="18" /> Bình luận @if (total()) { <span class="count">{{ total() }}</span> }</h2>

      @if (auth.isLoggedIn()) {
        <div class="box">
          <textarea
            rows="3"
            maxlength="2000"
            placeholder="Viết bình luận…"
            [(ngModel)]="draft"
            [disabled]="posting()"></textarea>
          <div class="box-foot">
            @if (episode()) { <span class="tag text-muted">Bình luận ở Tập {{ episode() }}</span> } @else { <span></span> }
            <button uiBtn size="sm" [disabled]="posting() || !draft.trim()" (click)="post()">
              @if (posting()) { <ui-spinner [size]="14" /> } @else { <ui-icon name="arrow-right" [size]="14" /> }
              Gửi
            </button>
          </div>
        </div>
      } @else {
        <p class="login-hint text-muted">
          <a routerLink="/login" [queryParams]="{ returnUrl: '/anime/' + animeId() }">Đăng nhập</a> để bình luận.
        </p>
      }

      @if (loading()) {
        <div class="center"><ui-spinner [size]="20" /></div>
      } @else if (error()) {
        <ui-empty-state icon="alert" tone="danger" heading="Không tải được bình luận" [message]="error()" compact>
          <button uiBtn size="sm" (click)="load()"><ui-icon name="refresh" [size]="14" /> Thử lại</button>
        </ui-empty-state>
      } @else if (!items().length) {
        <ui-empty-state icon="list" heading="Chưa có bình luận" message="Hãy là người đầu tiên bình luận." compact />
      } @else {
        <ul class="list">
          @for (c of items(); track c.id) {
            <li class="item">
              <span class="avatar">{{ initial(c.userName) }}</span>
              <div class="body">
                <div class="meta">
                  <b class="name">{{ c.userName }}</b>
                  @if (c.episode) { <span class="ep">Tập {{ c.episode }}</span> }
                  <time class="text-muted">{{ c.createdAt | date: 'HH:mm dd/MM/yyyy' }}</time>
                  @if (isMine(c)) {
                    <button class="del" title="Xoá" (click)="remove(c)"><ui-icon name="x" [size]="13" /></button>
                  }
                </div>
                <p class="content">{{ c.content }}</p>
              </div>
            </li>
          }
        </ul>

        @if (items().length < total()) {
          <button uiBtn variant="secondary" size="sm" class="more" [disabled]="loadingMore()" (click)="loadMore()">
            @if (loadingMore()) { <ui-spinner [size]="14" /> Đang tải… } @else { Xem thêm bình luận }
          </button>
        }
      }
    </section>
  `,
  styles: `
    .comments { margin-top: 20px; padding: 24px; display: grid; gap: 16px; }
    .section-title { display: inline-flex; align-items: center; gap: 8px; }
    .count { font-size: 13px; color: var(--muted); font-weight: 600; }
    .box { display: grid; gap: 8px; }
    textarea {
      width: 100%; resize: vertical; min-height: 76px; padding: 12px 14px;
      background: var(--surface-2); border: 1px solid var(--line); border-radius: var(--radius-sm);
      color: var(--text); font: inherit; font-size: 14px;
      &:focus { outline: none; border-color: var(--accent); }
    }
    .box-foot { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
    .tag { font-size: 12px; }
    .login-hint { font-size: 14px; a { color: var(--accent); font-weight: 600; } }
    .center { display: grid; place-items: center; padding: 24px 0; }
    .list { display: grid; gap: 16px; }
    .item { display: grid; grid-template-columns: 38px minmax(0, 1fr); gap: 12px; }
    .avatar {
      display: grid; place-items: center; width: 38px; height: 38px; border-radius: 50%;
      background: var(--accent-gradient); color: #fff; font-weight: 700; font-size: 15px; text-transform: uppercase;
    }
    .body { min-width: 0; display: grid; gap: 4px; }
    .meta { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; font-size: 12.5px; }
    .name { font-size: 13.5px; }
    .ep {
      padding: 1px 7px; border-radius: 999px; background: var(--accent-soft, var(--surface-3));
      color: var(--accent); font-size: 11px; font-weight: 700;
    }
    .del {
      margin-left: auto; display: grid; place-items: center; width: 24px; height: 24px; border: 0; border-radius: 6px;
      background: none; color: var(--muted); cursor: pointer;
      &:hover { color: var(--danger); background: var(--danger-soft); }
    }
    .content { font-size: 14px; line-height: 1.55; white-space: pre-wrap; word-break: break-word; }
    .more { justify-self: center; }
  `,
})
export class CommentsSection {
  protected readonly auth = inject(UserAuth);
  private readonly api = inject(CommentApi);
  private readonly toast = inject(ToastService);

  readonly animeId = input.required<number>();
  /** Tập đang xem (gửi kèm bình luận). */
  readonly episode = input<number | null>(null);

  protected readonly items = signal<Comment[]>([]);
  protected readonly total = signal(0);
  protected readonly loading = signal(false);
  protected readonly loadingMore = signal(false);
  protected readonly posting = signal(false);
  protected readonly error = signal<string | null>(null);
  protected draft = '';

  private readonly pageSize = 30;

  constructor() {
    // Đổi phim → tải lại bình luận.
    effect(() => {
      this.animeId();
      untracked(() => this.load());
    });
  }

  protected load(): void {
    this.loading.set(true);
    this.error.set(null);
    this.api.list(this.animeId(), this.pageSize, 0).subscribe({
      next: page => {
        this.loading.set(false);
        this.items.set(page.items);
        this.total.set(page.total);
      },
      error: (message: string) => {
        this.loading.set(false);
        this.error.set(message);
      },
    });
  }

  protected loadMore(): void {
    if (this.loadingMore()) return;
    this.loadingMore.set(true);
    this.api.list(this.animeId(), this.pageSize, this.items().length).subscribe({
      next: page => {
        this.loadingMore.set(false);
        const seen = new Set(this.items().map(c => c.id));
        this.items.update(list => [...list, ...page.items.filter(c => !seen.has(c.id))]);
        this.total.set(page.total);
      },
      error: (message: string) => {
        this.loadingMore.set(false);
        this.toast.show('danger', 'Không tải được', message);
      },
    });
  }

  protected post(): void {
    const content = this.draft.trim();
    if (!content || this.posting()) return;

    this.posting.set(true);
    this.api.add({ animeId: this.animeId(), episode: this.episode(), content }).subscribe({
      next: comment => {
        this.posting.set(false);
        this.draft = '';
        this.items.update(list => [comment, ...list]);
        this.total.update(n => n + 1);
      },
      error: (message: string) => {
        this.posting.set(false);
        this.toast.show('danger', 'Không gửi được bình luận', message);
      },
    });
  }

  protected remove(comment: Comment): void {
    this.api.remove(comment.id).subscribe({
      next: () => {
        this.items.update(list => list.filter(c => c.id !== comment.id));
        this.total.update(n => Math.max(0, n - 1));
      },
      error: (message: string) => this.toast.show('danger', 'Không xoá được', message),
    });
  }

  protected isMine(comment: Comment): boolean {
    return this.auth.user()?.id === comment.userId;
  }

  protected initial(name: string): string {
    return name.trim().charAt(0) || '?';
  }
}
