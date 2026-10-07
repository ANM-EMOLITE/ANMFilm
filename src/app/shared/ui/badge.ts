import { booleanAttribute, ChangeDetectionStrategy, Component, input } from '@angular/core';

export type BadgeTone = 'neutral' | 'accent' | 'success' | 'warning' | 'danger' | 'info';

/** Nhãn nhỏ: `<ui-badge tone="success" dot>Đang chiếu</ui-badge>` */
@Component({
  selector: 'ui-badge',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[class]': "'tone-' + tone()", '[class.solid]': 'solid()' },
  template: `@if (dot()) { <span class="dot"></span> }<ng-content />`,
  styles: `
    :host {
      display: inline-flex; align-items: center; gap: 6px;
      height: 22px; padding: 0 9px; border-radius: var(--radius-full);
      font-size: 11px; font-weight: 600; white-space: nowrap; letter-spacing: .01em;
      color: var(--c); background: var(--bg-c); border: 1px solid transparent;
    }
    :host(.solid) { background: var(--c); color: #0a0b10; }
    .dot { width: 6px; height: 6px; border-radius: 50%; background: currentColor; box-shadow: 0 0 8px currentColor; }
    :host(.tone-neutral) { --c: var(--text-2); --bg-c: rgb(255 255 255 / .06); border-color: var(--line); }
    :host(.tone-accent)  { --c: var(--accent);  --bg-c: var(--accent-soft); }
    :host(.tone-success) { --c: var(--success); --bg-c: var(--success-soft); }
    :host(.tone-warning) { --c: var(--warning); --bg-c: var(--warning-soft); }
    :host(.tone-danger)  { --c: var(--danger);  --bg-c: var(--danger-soft); }
    :host(.tone-info)    { --c: var(--info);    --bg-c: var(--info-soft); }
  `,
})
export class UiBadge {
  readonly tone = input<BadgeTone>('neutral');
  readonly dot = input(false, { transform: booleanAttribute });
  readonly solid = input(false, { transform: booleanAttribute });
}
