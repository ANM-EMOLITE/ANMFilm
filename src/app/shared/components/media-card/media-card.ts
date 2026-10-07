import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MediaSearchResult } from '@core/models/api.models';
import { formatLabel, pickTitle, statusLabel } from '@core/utils/media.utils';
import { UiBadge, UiIcon } from '@shared/ui';

/** Thẻ poster anime dùng ở lưới danh sách. */
@Component({
  selector: 'app-media-card',
  imports: [RouterLink, UiBadge, UiIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './media-card.html',
  styleUrl: './media-card.scss',
})
export class MediaCard {
  readonly media = input.required<MediaSearchResult>();
  readonly rank = input<number | null>(null);

  protected readonly title = computed(() => pickTitle(this.media().titles));
  protected readonly status = computed(() => statusLabel(this.media().status));
  protected readonly format = computed(() => formatLabel(this.media().format));
  protected readonly cover = computed(() => {
    const images = this.media().images;
    return images?.coverLg || images?.coverXl || images?.coverMd || '';
  });
}
