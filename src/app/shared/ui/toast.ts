import { ChangeDetectionStrategy, Component, Injectable, inject, signal } from '@angular/core';
import { IconName, UiIcon } from './icon';

export type ToastTone = 'info' | 'success' | 'warning' | 'danger';

export interface Toast {
  id: number;
  tone: ToastTone;
  title: string;
  message?: string;
}

const ICON: Record<ToastTone, IconName> = { info: 'info', success: 'check', warning: 'refresh', danger: 'alert' };

/** Thông báo nổi góc màn hình. Gọi `inject(ToastService).show(...)` ở bất cứ đâu. */
@Injectable({ providedIn: 'root' })
export class ToastService {
  readonly toasts = signal<Toast[]>([]);
  private seq = 0;

  show(tone: ToastTone, title: string, message?: string, duration = 4000): void {
    const toast: Toast = { id: ++this.seq, tone, title, message };
    // Giữ tối đa 4 thông báo.
    this.toasts.update(list => [...list.slice(-3), toast]);
    setTimeout(() => this.dismiss(toast.id), duration);
  }

  dismiss(id: number): void {
    this.toasts.update(list => list.filter(t => t.id !== id));
  }
}

/** Đặt một lần ở App root. */
@Component({
  selector: 'ui-toaster',
  imports: [UiIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @for (t of service.toasts(); track t.id) {
      <div class="toast" [class]="'toast ' + t.tone" role="status">
        <span class="icon"><ui-icon [name]="icon[t.tone]" [size]="16" /></span>
        <div class="body">
          <strong>{{ t.title }}</strong>
          @if (t.message) { <p>{{ t.message }}</p> }
        </div>
        <button type="button" aria-label="Đóng" (click)="service.dismiss(t.id)"><ui-icon name="x" [size]="14" /></button>
      </div>
    }
  `,
  styles: `
    :host {
      position: fixed; z-index: 100; right: 20px; bottom: 20px;
      display: flex; flex-direction: column; gap: 10px; width: min(360px, calc(100vw - 40px));
      pointer-events: none;
    }
    .toast {
      pointer-events: auto; display: flex; align-items: flex-start; gap: 12px; padding: 12px 12px 12px 14px;
      background: var(--bg-elevated); border: 1px solid var(--line-strong); border-radius: var(--radius);
      box-shadow: var(--shadow-lg); animation: ui-fade-in .2s var(--ease);
      --c: var(--info); --bg-c: var(--info-soft);
    }
    .success { --c: var(--success); --bg-c: var(--success-soft); }
    .warning { --c: var(--warning); --bg-c: var(--warning-soft); }
    .danger { --c: var(--danger); --bg-c: var(--danger-soft); }
    .icon { display: grid; place-items: center; width: 28px; height: 28px; border-radius: 8px; background: var(--bg-c); color: var(--c); flex: none; }
    .body { flex: 1; min-width: 0; font-size: 13px; }
    strong { display: block; font-weight: 600; }
    p { color: var(--muted); font-size: 12px; margin-top: 2px; word-break: break-word; }
    button { background: none; border: 0; color: var(--muted); cursor: pointer; padding: 4px; border-radius: 6px; }
    button:hover { color: var(--text); background: var(--surface-2); }
  `,
})
export class UiToaster {
  protected readonly service = inject(ToastService);
  protected readonly icon = ICON;
}
