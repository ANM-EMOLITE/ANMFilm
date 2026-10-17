export interface LoginResponse {
  token: string;
  expiresAt: string;
  username: string;
}

export type SyncJobStatus = 'QUEUED' | 'RUNNING' | 'SUCCEEDED' | 'FAILED' | 'CANCELED';

export interface SyncJob {
  id: string;
  /** CATALOG: đồng bộ danh mục · STREAMS: lưu sẵn nguồn phát của 1 phim */
  kind: 'CATALOG' | 'STREAMS' | 'HEALTH';
  animeId?: number | null;
  /** Tên phim (job STREAMS) */
  target?: string | null;
  status: SyncJobStatus;
  /** CATALOG: các tab · STREAMS: các provider */
  lists: string[];
  updateExisting: boolean;
  progress?: string | null;
  processed: number;
  /** CATALOG: anime mới tạo · STREAMS: tập mới lưu link */
  added: number;
  /** Đã có và được lấy lại (khi updateExisting) */
  updated: number;
  /** Đã có trong DB nên bỏ qua */
  skipped: number;
  error?: string | null;
  triggeredBy?: string | null;
  createdAt: string;
  startedAt?: string | null;
  finishedAt?: string | null;
}

export interface AdminList {
  key: string;
  label: string;
  itemCount: number;
  syncedAt: string;
}

export interface AdminStats {
  totalAnime: number;
  withStream: number;
  hidden: number;
  lists: AdminList[];
  lastJob?: SyncJob | null;
  /** Số phim có ít nhất 1 provider lỗi */
  broken: number;
}

export interface AdminAnime {
  id: number;
  title: string;
  cover?: string | null;
  format?: string | null;
  status?: string | null;
  season?: string | null;
  seasonYear?: number | null;
  totalUnits?: number | null;
  providers: string[];
  hasStream: boolean;
  isHidden: boolean;
  syncedAt: string;
  /** Bị ẩn tự động vì mọi nguồn đều lỗi */
  autoHidden?: boolean;
  providerStatuses?: AdminProviderStatus[] | null;
}

export interface AdminAnimePage {
  items: AdminAnime[];
  total: number;
  page: number;
  pageSize: number;
}

export interface AdminAnimeQuery {
  q?: string;
  hasStream?: boolean | null;
  hidden?: boolean | null;
  health?: 'broken' | 'ok' | 'unchecked' | null;
  list?: string | null;
  page?: number;
  pageSize?: number;
}

export interface SyncAnimeResult {
  anime: AdminAnime;
  created: boolean;
}

export interface AdminProviderStatus {
  provider: string;
  status: 'OK' | 'BROKEN';
  isDisabled: boolean;
  /** AUTO: kiểm tra tự tắt · ADMIN: admin tự đặt */
  disabledBy?: 'AUTO' | 'ADMIN' | null;
  lastError?: string | null;
  checkedAt: string;
}
