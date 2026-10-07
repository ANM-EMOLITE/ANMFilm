import { booleanAttribute, Directive, input } from '@angular/core';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

/**
 * Nút dùng chung: `<button uiBtn variant="ghost" size="sm">`.
 * Style nằm ở `styles.scss` (.ui-btn) để dùng được cho cả <a> và <button>.
 */
@Directive({
  selector: 'button[uiBtn], a[uiBtn]',
  host: {
    class: 'ui-btn',
    '[class.ui-btn--primary]': "variant() === 'primary'",
    '[class.ui-btn--secondary]': "variant() === 'secondary'",
    '[class.ui-btn--ghost]': "variant() === 'ghost'",
    '[class.ui-btn--danger]': "variant() === 'danger'",
    '[class.ui-btn--sm]': "size() === 'sm'",
    '[class.ui-btn--lg]': "size() === 'lg'",
    '[class.ui-btn--icon]': 'iconOnly()',
    '[class.ui-btn--block]': 'block()',
    '[class.is-active]': 'active()',
  },
})
export class UiButton {
  readonly variant = input<ButtonVariant>('primary');
  readonly size = input<ButtonSize>('md');
  readonly iconOnly = input(false, { transform: booleanAttribute });
  readonly block = input(false, { transform: booleanAttribute });
  readonly active = input(false, { transform: booleanAttribute });
}
