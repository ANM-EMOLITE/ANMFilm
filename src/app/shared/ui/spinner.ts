import { ChangeDetectionStrategy, Component, input } from '@angular/core';

@Component({
  selector: 'ui-spinner',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { role: 'status', '[style.--s.px]': 'size()' },
  template: `<span class="ring"></span><span class="sr-only">Đang tải</span>`,
  styles: `
    :host { display: inline-flex; width: var(--s); height: var(--s); flex: none; }
    .ring {
      width: 100%; height: 100%; border-radius: 50%;
      border: 2px solid rgb(255 255 255 / .15); border-top-color: var(--accent);
      animation: ui-spin .7s linear infinite;
    }
  `,
})
export class UiSpinner {
  readonly size = input(18);
}
