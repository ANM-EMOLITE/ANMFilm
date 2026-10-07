import { booleanAttribute, ChangeDetectionStrategy, Component, input } from '@angular/core';
import { IconName, UiIcon } from './icon';

/** Trạng thái rỗng / lỗi, có slot cho nút hành động. */
@Component({
  selector: 'ui-empty-state',
  imports: [UiIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[class.danger]': "tone() === 'danger'", '[class.compact]': 'compact()' },
  template: `
    <div class="icon"><ui-icon [name]="icon()" [size]="compact() ? 20 : 26" /></div>
    @if (heading()) { <h3>{{ heading() }}</h3> }
    @if (message()) { <p>{{ message() }}</p> }
    <div class="actions"><ng-content /></div>
  `,
  styles: `
    :host {
      display: flex; flex-direction: column; align-items: center; text-align: center;
      gap: 8px; padding: 48px 16px; color: var(--muted); animation: ui-fade-in .25s var(--ease);
    }
    :host(.compact) { padding: 24px 12px; }
    .icon {
      display: grid; place-items: center; width: 56px; height: 56px; border-radius: 50%;
      background: var(--surface-2); color: var(--text-2); margin-bottom: 4px;
    }
    :host(.compact) .icon { width: 40px; height: 40px; }
    :host(.danger) .icon { background: var(--danger-soft); color: var(--danger); }
    h3 { color: var(--text); font-size: 15px; font-weight: 600; }
    p { max-width: 420px; font-size: 13px; }
    .actions { display: flex; gap: 8px; margin-top: 6px; }
    .actions:empty { display: none; }
  `,
})
export class UiEmptyState {
  readonly icon = input<IconName>('film');
  readonly heading = input('');
  readonly message = input<string | null>('');
  readonly tone = input<'neutral' | 'danger'>('neutral');
  readonly compact = input(false, { transform: booleanAttribute });
}
