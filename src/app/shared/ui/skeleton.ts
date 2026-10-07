import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/** Khối giữ chỗ khi đang tải: `<ui-skeleton width="60%" height="12px" />` */
@Component({
  selector: 'ui-skeleton',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    'aria-hidden': 'true',
    '[style.width]': 'width()',
    '[style.height]': 'height()',
    '[style.aspect-ratio]': 'ratio()',
    '[style.border-radius]': 'radius()',
  },
  template: ``,
  styles: `
    :host {
      display: block; position: relative; overflow: hidden;
      background: var(--surface-2);
    }
    :host::after {
      content: ''; position: absolute; inset: 0; transform: translateX(-100%);
      background: linear-gradient(90deg, transparent, rgb(255 255 255 / .05), transparent);
      animation: ui-shimmer 1.4s infinite;
    }
  `,
})
export class UiSkeleton {
  readonly width = input('100%');
  readonly height = input<string | null>('14px');
  readonly ratio = input<string | null>(null);
  readonly radius = input('var(--radius-sm)');
}
