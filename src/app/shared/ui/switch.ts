import { booleanAttribute, ChangeDetectionStrategy, Component, input, model } from '@angular/core';

/** Công tắc bật/tắt: `<ui-switch [(checked)]="auto" label="Tự động" />` */
@Component({
  selector: 'ui-switch',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <label>
      <button
        type="button"
        role="switch"
        [attr.aria-checked]="checked()"
        [disabled]="disabled()"
        (click)="checked.set(!checked())">
        <span class="thumb"></span>
      </button>
      @if (label()) {
        <span class="text">
          {{ label() }}
          @if (hint()) { <small>{{ hint() }}</small> }
        </span>
      }
    </label>
  `,
  styles: `
    label { display: inline-flex; align-items: center; gap: 10px; cursor: pointer; user-select: none; }
    button {
      position: relative; flex: none; width: 36px; height: 20px; padding: 0; border: 0; cursor: pointer;
      border-radius: var(--radius-full); background: var(--surface-3);
      transition: background var(--dur) var(--ease);
    }
    button[aria-checked='true'] { background: var(--accent); }
    button:disabled { opacity: .5; cursor: default; }
    .thumb {
      position: absolute; top: 2px; left: 2px; width: 16px; height: 16px; border-radius: 50%;
      background: #fff; box-shadow: var(--shadow-sm); transition: transform var(--dur) var(--ease);
    }
    button[aria-checked='true'] .thumb { transform: translateX(16px); }
    .text { display: flex; flex-direction: column; font-size: 13px; font-weight: 500; line-height: 1.3; }
    small { color: var(--muted); font-size: 11px; font-weight: 400; }
  `,
})
export class UiSwitch {
  readonly checked = model(false);
  readonly label = input('');
  readonly hint = input('');
  readonly disabled = input(false, { transform: booleanAttribute });
}
