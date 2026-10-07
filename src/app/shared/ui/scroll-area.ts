import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  afterNextRender,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';

/**
 * Vùng cuộn có thanh cuộn mảnh + hiệu ứng mờ dần ở mép khi còn nội dung bị che.
 * `<ui-scroll-area maxHeight="320px">…</ui-scroll-area>`
 */
@Component({
  selector: 'ui-scroll-area',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[class.fade-top]': 'fadeTop()',
    '[class.fade-bottom]': 'fadeBottom()',
    '[class.horizontal]': "direction() === 'x'",
  },
  template: `
    <div class="viewport" #viewport [style.max-height]="maxHeight()" (scroll)="update()">
      <ng-content />
    </div>
  `,
  styles: `
    :host { display: block; position: relative; min-height: 0; --fade: 28px; }
    .viewport {
      position: relative; height: 100%; overflow-y: auto; overflow-x: hidden; overscroll-behavior: contain;
      scrollbar-gutter: stable;
    }
    :host(.horizontal) .viewport { overflow-x: auto; overflow-y: hidden; scrollbar-gutter: auto; }
    :host(.fade-top) .viewport { mask-image: linear-gradient(to bottom, transparent, #000 var(--fade)); }
    :host(.fade-bottom) .viewport { mask-image: linear-gradient(to top, transparent, #000 var(--fade)); }
    :host(.horizontal) .viewport { mask-image: none !important; }
    :host(.fade-top.fade-bottom) .viewport {
      mask-image: linear-gradient(to bottom, transparent, #000 var(--fade), #000 calc(100% - var(--fade)), transparent);
    }
  `,
})
export class UiScrollArea {
  readonly maxHeight = input<string | null>(null);
  readonly direction = input<'y' | 'x'>('y');

  protected readonly fadeTop = signal(false);
  protected readonly fadeBottom = signal(false);

  private readonly viewport = viewChild.required<ElementRef<HTMLElement>>('viewport');

  constructor() {
    const destroyRef = inject(DestroyRef);
    afterNextRender(() => {
      const el = this.viewport().nativeElement;
      const observer = new ResizeObserver(() => this.update());
      observer.observe(el);
      if (el.firstElementChild) observer.observe(el.firstElementChild);
      const mutations = new MutationObserver(() => this.update());
      mutations.observe(el, { childList: true, subtree: true });
      destroyRef.onDestroy(() => {
        observer.disconnect();
        mutations.disconnect();
      });
      this.update();
    });
  }

  /** Cuộn để phần tử con hiện trong vùng nhìn (không làm cuộn cả trang). */
  scrollIntoView(child: HTMLElement, behavior: ScrollBehavior = 'smooth'): void {
    const el = this.viewport().nativeElement;
    const top = child.offsetTop;
    if (top < el.scrollTop || top + child.offsetHeight > el.scrollTop + el.clientHeight) {
      el.scrollTo({ top: top - el.clientHeight / 2 + child.offsetHeight / 2, behavior });
    }
  }

  protected update(): void {
    const el = this.viewport().nativeElement;
    if (this.direction() === 'x') {
      this.fadeTop.set(el.scrollLeft > 2);
      this.fadeBottom.set(el.scrollLeft + el.clientWidth < el.scrollWidth - 2);
    } else {
      this.fadeTop.set(el.scrollTop > 2);
      this.fadeBottom.set(el.scrollTop + el.clientHeight < el.scrollHeight - 2);
    }
  }
}
