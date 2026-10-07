import { LocalizedText } from '../models/api.models';

/** Ưu tiên tiêu đề tiếng Việt → tiếng Anh → romaji. */
export function pickTitle(titles?: LocalizedText | null): string {
  if (!titles) return '(không tên)';
  return (
    titles['vi'] ||
    titles['en'] ||
    titles['user-preferred'] ||
    titles['main'] ||
    titles['ja-ro'] ||
    Object.values(titles).find(Boolean) ||
    '(không tên)'
  );
}

export function pickDescription(descriptions?: LocalizedText | null): string {
  const text = descriptions?.['vi'] || descriptions?.['en'] || '';
  // Giữ <br>, bỏ các thẻ HTML khác.
  return text.replace(/<(?!br\s*\/?>)[^>]*>/gi, '');
}

export function errorMessage(err: unknown): string {
  if (err && typeof err === 'object' && 'message' in err) return String((err as { message: unknown }).message);
  return 'Có lỗi xảy ra';
}

const STATUS_LABELS: Record<string, string> = {
  RELEASING: 'Đang chiếu',
  FINISHED: 'Hoàn thành',
  NOT_YET_RELEASED: 'Sắp chiếu',
  CANCELLED: 'Đã hủy',
  HIATUS: 'Tạm ngưng',
};

const FORMAT_LABELS: Record<string, string> = {
  TV: 'TV',
  TV_SHORT: 'TV ngắn',
  MOVIE: 'Movie',
  SPECIAL: 'Special',
  OVA: 'OVA',
  ONA: 'ONA',
  MUSIC: 'Music',
};

const SEASON_LABELS: Record<string, string> = {
  WINTER: 'Đông',
  SPRING: 'Xuân',
  SUMMER: 'Hạ',
  FALL: 'Thu',
};

export function statusLabel(status?: string | null): string {
  return status ? (STATUS_LABELS[status] ?? status) : '';
}

export function formatLabel(format?: string | null): string {
  return format ? (FORMAT_LABELS[format] ?? format) : '';
}

export function seasonLabel(season?: string | null): string {
  return season ? (SEASON_LABELS[season] ?? season) : '';
}
