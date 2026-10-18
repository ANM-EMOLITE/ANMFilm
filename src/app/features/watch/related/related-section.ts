import { ChangeDetectionStrategy, Component, effect, inject, input, signal, untracked } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MediaRelation, MediaSearchResult } from '@core/models/api.models';
import { AnimeApi } from '@core/services/anime-api';
import { pickTitle } from '@core/utils/media.utils';
import { UiIcon } from '@shared/ui';

interface RelatedItem {
  id: number;
  title: string;
  cover: string;
  label: string;
  order: number;
}

/** Nhãn + thứ tự ưu tiên cho các loại quan hệ đáng hiển thị (giống "các phần"). */
const RELATIONS: Record<string, { label: string; order: number }> = {
  PREQUEL: { label: 'Phần trước', order: 1 },
  PARENT: { label: 'Phần chính', order: 2 },
  SEQUEL: { label: 'Phần sau', order: 3 },
  SIDE_STORY: { label: 'Ngoại truyện', order: 4 },
  SPIN_OFF: { label: 'Spin-off', order: 5 },
  ALTERNATIVE: { label: 'Bản khác', order: 6 },
};

/** Dải "Phần liên quan" (prequel/sequel/ngoại truyện…) lấy từ relations của metadata. */
@Component({
  selector: 'app-related-section',
  imports: [RouterLink, UiIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (items().length) {
      <section class="related card">
        <h2 class="section-title"><ui-icon name="layers" [size]="18" /> Phần liên quan</h2>
        <div class="track">
          @for (it of items(); track it.id) {
            <a class="rel-card" [routerLink]="['/anime', it.id]" [title]="it.title">
              <span class="poster">
                @if (it.cover) { <img [src]="it.cover" [alt]="it.title" loading="lazy" /> }
                @else { <span class="ph"><ui-icon name="film" [size]="20" /></span> }
                <span class="badge">{{ it.label }}</span>
              </span>
              <span class="t">{{ it.title }}</span>
            </a>
          }
        </div>
      </section>
    }
  `,
  styles: `
    .related { margin-top: 20px; padding: 24px; display: grid; gap: 16px; }
    .section-title { display: inline-flex; align-items: center; gap: 8px; }
    .track { display: grid; grid-auto-flow: column; grid-auto-columns: 140px; gap: 14px; overflow-x: auto; padding-bottom: 6px; scrollbar-width: thin; }
    @media (max-width: 640px) { .track { grid-auto-columns: 116px; } }
    .rel-card { display: grid; gap: 7px; &:hover .poster img { transform: scale(1.06); } &:hover .t { color: var(--accent); } }
    .poster {
      position: relative; display: block; aspect-ratio: 2 / 3; border-radius: var(--radius); overflow: hidden; background: var(--surface-3);
      img { width: 100%; height: 100%; object-fit: cover; transition: transform .25s ease; }
      .ph { display: grid; place-items: center; height: 100%; color: var(--muted); }
    }
    .badge {
      position: absolute; left: 7px; top: 7px; padding: 2px 7px; border-radius: 999px;
      background: var(--accent-gradient, var(--accent)); color: #fff; font-size: 10.5px; font-weight: 700;
      box-shadow: 0 2px 8px rgb(0 0 0 / .25);
    }
    .t { font-size: 12.5px; font-weight: 600; line-height: 1.35; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
  `,
})
export class RelatedSection {
  private readonly api = inject(AnimeApi);

  readonly relations = input<MediaRelation[]>([]);

  protected readonly items = signal<RelatedItem[]>([]);

  constructor() {
    effect(() => {
      const rels = this.relations();
      untracked(() => this.loadFor(rels));
    });
  }

  private loadFor(rels: MediaRelation[]): void {
    // Chỉ giữ các loại quan hệ đáng hiển thị, map id → nhãn.
    const typeById = new Map<number, { label: string; order: number }>();
    for (const r of rels) {
      const info = r.relationType ? RELATIONS[r.relationType.toUpperCase()] : undefined;
      if (info && !typeById.has(r.relatedMediaId)) typeById.set(r.relatedMediaId, info);
    }

    const ids = [...typeById.keys()];
    if (!ids.length) {
      this.items.set([]);
      return;
    }

    this.api.metadataBatch(ids).subscribe({
      next: results => this.items.set(this.build(results, typeById)),
      error: () => this.items.set([]),
    });
  }

  private build(results: MediaSearchResult[], typeById: Map<number, { label: string; order: number }>): RelatedItem[] {
    return results
      .filter(m => m.mediaType === 'ANIME' && typeById.has(m.id))
      .map(m => {
        const info = typeById.get(m.id)!;
        const images = m.images;
        return {
          id: m.id,
          title: pickTitle(m.titles),
          cover: images?.coverLg || images?.coverXl || images?.coverMd || '',
          label: info.label,
          order: info.order,
        };
      })
      .sort((a, b) => a.order - b.order);
  }
}
