import {
  ChangeDetectionStrategy,
  booleanAttribute,
  Component,
  ElementRef,
  computed,
  effect,
  inject,
  input,
  model,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { IconName, UiIcon } from './icon';
import { UiScrollArea } from './scroll-area';
import { UiSpinner } from './spinner';

export type OptionStatus = 'ok' | 'error' | 'loading' | 'idle';

export interface DropdownOption<T = string> {
  value: T;
  label: string;
  /** Chữ phụ hiển thị bên phải (vd: "12 tập", "lỗi 504"). */
  hint?: string;
  status?: OptionStatus;
  disabled?: boolean;
}

let nextId = 0;

/**
 * Dropdown dùng chung, thay cho <select> mặc định.
 * `<ui-dropdown [options]="opts" [(value)]="selected" label="Server" />`
 * – Bàn phím: ↑ ↓ Enter Esc, gõ để lọc (khi searchable).
 */
@Component({
  selector: 'ui-dropdown',
  imports: [UiIcon, UiScrollArea, UiSpinner],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[class.open]': 'open()',
    '[class.disabled]': 'disabled()',
    '(document:click)': 'onDocumentClick($event)',
    '(keydown)': 'onKeydown($event)',
  },
  templateUrl: './dropdown.html',
  styleUrl: './dropdown.scss',
})
export class UiDropdown<T = string> {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  readonly options = input.required<DropdownOption<T>[]>();
  readonly value = model<T | null>(null);
  readonly label = input('');
  readonly icon = input<IconName | null>(null);
  readonly placeholder = input('Chọn…');
  readonly disabled = input(false, { transform: booleanAttribute });
  readonly loading = input(false, { transform: booleanAttribute });
  /** null = tự bật khi có hơn 8 lựa chọn. */
  readonly searchable = input<boolean | null>(null);
  readonly maxPanelHeight = input('280px');

  /** Phát ra khi người dùng chọn (không phát khi value đổi từ code). */
  readonly changed = output<T>();

  protected readonly id = `ui-dd-${nextId++}`;
  protected readonly open = signal(false);
  protected readonly query = signal('');
  protected readonly activeIndex = signal(0);

  protected readonly selected = computed(() => this.options().find(o => o.value === this.value()) ?? null);
  protected readonly canSearch = computed(() => this.searchable() ?? this.options().length > 8);
  protected readonly filtered = computed(() => {
    const q = this.query().trim().toLowerCase();
    return q ? this.options().filter(o => o.label.toLowerCase().includes(q)) : this.options();
  });

  private readonly searchInput = viewChild<ElementRef<HTMLInputElement>>('search');
  private readonly scrollArea = viewChild(UiScrollArea);

  constructor() {
    // Mở panel → focus ô tìm, đưa mục đang chọn vào giữa vùng nhìn.
    effect(() => {
      if (!this.open()) return;
      const input = this.searchInput()?.nativeElement;
      queueMicrotask(() => {
        input?.focus();
        this.scrollToActive('auto');
      });
    });
  }

  toggle(): void {
    if (this.disabled()) return;
    this.open() ? this.close() : this.show();
  }

  protected show(): void {
    this.query.set('');
    const index = this.options().findIndex(o => o.value === this.value());
    this.activeIndex.set(Math.max(0, index));
    this.open.set(true);
  }

  protected close(focusTrigger = false): void {
    this.open.set(false);
    if (focusTrigger) this.host.nativeElement.querySelector<HTMLElement>('.trigger')?.focus();
  }

  protected choose(option: DropdownOption<T>): void {
    if (option.disabled) return;
    this.close(true);
    if (option.value === this.value()) return;
    this.value.set(option.value);
    this.changed.emit(option.value);
  }

  protected onQuery(event: Event): void {
    this.query.set((event.target as HTMLInputElement).value);
    this.activeIndex.set(0);
  }

  protected onKeydown(event: KeyboardEvent): void {
    if (this.disabled()) return;

    if (!this.open()) {
      if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(event.key) && this.isTriggerEvent(event)) {
        event.preventDefault();
        this.show();
      }
      return;
    }

    const list = this.filtered();
    switch (event.key) {
      case 'ArrowDown':
      case 'ArrowUp': {
        event.preventDefault();
        const step = event.key === 'ArrowDown' ? 1 : -1;
        this.activeIndex.update(i => (list.length ? (i + step + list.length) % list.length : 0));
        this.scrollToActive();
        break;
      }
      case 'Enter': {
        event.preventDefault();
        const option = list[this.activeIndex()];
        if (option) this.choose(option);
        break;
      }
      case 'Escape':
        event.preventDefault();
        this.close(true);
        break;
      case 'Tab':
        this.close();
        break;
    }
  }

  protected onDocumentClick(event: MouseEvent): void {
    if (this.open() && !this.host.nativeElement.contains(event.target as Node)) this.close();
  }

  private isTriggerEvent(event: KeyboardEvent): boolean {
    return (event.target as HTMLElement).classList.contains('trigger');
  }

  private scrollToActive(behavior: ScrollBehavior = 'smooth'): void {
    queueMicrotask(() => {
      const el = this.host.nativeElement.querySelector<HTMLElement>(`#${this.id}-opt-${this.activeIndex()}`);
      if (el) this.scrollArea()?.scrollIntoView(el, behavior);
    });
  }
}
