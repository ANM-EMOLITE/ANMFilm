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
