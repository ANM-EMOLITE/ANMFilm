import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { IconName, UiIcon } from './icon';

export interface TabItem<T extends string = string> {
  id: T;
  label: string;
  icon?: IconName;
}

/** Thanh tab dạng "pill", cuộn ngang được trên mobile. */
@Component({
  selector: 'ui-tabs',
  imports: [UiIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="track no-scrollbar" role="tablist">
      @for (t of items(); track t.id) {
        <button
          type="button"
          role="tab"
          [attr.aria-selected]="t.id === active()"
          [class.active]="t.id === active()"
          (click)="select.emit(t.id)">
          @if (t.icon) { <ui-icon [name]="t.icon" [size]="16" /> }
          {{ t.label }}
        </button>
      }
    </div>
  `,
  styles: `
    :host { display: block; min-width: 0; }
    .track {
      display: inline-flex; gap: 4px; max-width: 100%; overflow-x: auto; padding: 4px;
      background: var(--surface); border: 1px solid var(--line); border-radius: var(--radius-full);
    }
    button {
      flex: none; display: inline-flex; align-items: center; gap: 6px;
      height: 36px; padding: 0 16px; border: 0; border-radius: var(--radius-full); cursor: pointer;
      background: transparent; color: var(--muted); font-weight: 600; font-size: 13px; white-space: nowrap;
      transition: color var(--dur), background var(--dur);
    }
    button:hover { color: var(--text); background: var(--surface-2); }
    button.active { color: #fff; background: var(--accent-gradient); box-shadow: 0 4px 14px rgb(255 92 138 / .3); }
  `,
})
export class UiTabs<T extends string = string> {
  readonly items = input.required<TabItem<T>[]>();
  readonly active = input<T>();
  readonly select = output<T>();
}
