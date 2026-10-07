import { NgTemplateOutlet } from '@angular/common';
import {
  ChangeDetectionStrategy,
  booleanAttribute,
  Component,
  Directive,
  TemplateRef,
  computed,
  contentChildren,
  inject,
  input,
  output,
} from '@angular/core';

export interface TableColumn<T = unknown> {
  key: string;
  header: string;
  width?: string;
  align?: 'left' | 'center' | 'right';
  /** Giá trị hiển thị mặc định khi không có template `uiCell`. */
  value?: (row: T) => string | number | null | undefined;
}

/** Template tùy biến cho một cột: `<ng-template uiCell="status" let-row>…</ng-template>` */
@Directive({ selector: 'ng-template[uiCell]' })
export class UiCellDef {
  readonly key = input.required<string>({ alias: 'uiCell' });
  readonly template = inject<TemplateRef<{ $implicit: unknown; index: number }>>(TemplateRef);
}

/**
 * Bảng dùng chung.
 * ```html
 * <ui-table [columns]="cols" [rows]="rows" [trackBy]="row => row.id">
 *   <ng-template uiCell="status" let-row>…</ng-template>
 * </ui-table>
 * ```
 */
@Component({
  selector: 'ui-table',
  imports: [NgTemplateOutlet],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="wrap">
      <table [class.compact]="compact()">
        <thead>
          <tr>
            @for (c of columns(); track c.key) {
              <th [style.width]="c.width" [style.text-align]="c.align ?? 'left'">{{ c.header }}</th>
            }
          </tr>
        </thead>
        <tbody>
          @for (row of rows(); track trackBy()(row, i); let i = $index) {
            <tr
              [class.clickable]="clickable()"
              [class.highlight]="isHighlighted()(row)"
              (click)="clickable() && rowClick.emit(row)">
              @for (c of columns(); track c.key) {
                <td [style.text-align]="c.align ?? 'left'">
                  @if (cells()[c.key]; as tpl) {
                    <ng-container *ngTemplateOutlet="tpl; context: { $implicit: row, index: i }" />
                  } @else {
                    {{ c.value ? c.value(row) : $any(row)[c.key] }}
                  }
                </td>
              }
            </tr>
          } @empty {
            <tr><td class="empty" [attr.colspan]="columns().length">{{ emptyText() }}</td></tr>
          }
        </tbody>
      </table>
    </div>
  `,
  styles: `
    :host { display: block; }
    .wrap { overflow-x: auto; border: 1px solid var(--line); border-radius: var(--radius); }
    table { width: 100%; border-collapse: collapse; font-size: 13px; }
    th {
      position: sticky; top: 0; z-index: 1;
      padding: 10px 14px; background: var(--surface-2); color: var(--muted);
      font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: .06em; white-space: nowrap;
    }
    td { padding: 11px 14px; border-top: 1px solid var(--line); color: var(--text-2); vertical-align: middle; }
    .compact th { padding: 8px 12px; }
    .compact td { padding: 8px 12px; }
    tbody tr { transition: background var(--dur); }
    tbody tr:hover { background: rgb(255 255 255 / .025); }
    tr.clickable { cursor: pointer; }
    tr.highlight { background: var(--accent-soft); }
    tr.highlight td { color: var(--text); }
    .empty { text-align: center; color: var(--muted); padding: 24px; }
  `,
})
export class UiTable<T = unknown> {
  readonly columns = input.required<TableColumn<T>[]>();
  readonly rows = input.required<T[]>();
  readonly trackBy = input<(row: T, index: number) => unknown>((_, i) => i);
  readonly isHighlighted = input<(row: T) => boolean>(() => false);
  readonly clickable = input(false, { transform: booleanAttribute });
  readonly compact = input(false, { transform: booleanAttribute });
  readonly emptyText = input('Không có dữ liệu');

  readonly rowClick = output<T>();

  private readonly cellDefs = contentChildren(UiCellDef);
  protected readonly cells = computed(() => {
    const map: Record<string, TemplateRef<unknown>> = {};
    for (const def of this.cellDefs()) map[def.key()] = def.template;
    return map;
  });
}
