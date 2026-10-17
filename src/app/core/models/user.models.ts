export interface UserProfile {
  id: number;
  username: string;
  email: string;
  displayName?: string | null;
  createdAt: string;
  lastLoginAt?: string | null;
}

export interface UserAuthResponse {
  token: string;
  expiresAt: string;
  user: UserProfile;
}

export interface WatchlistItem {
  animeId: number;
  title?: string | null;
  cover?: string | null;
  addedAt: string;
}

export interface WatchHistoryEntry {
  animeId: number;
  title?: string | null;
  cover?: string | null;
  episode?: number | null;
  provider?: string | null;
  count: number;
  watchedAt: string;
}

export interface ActivityLog {
  id: number;
  action: 'REGISTER' | 'LOGIN' | 'WATCH' | 'WATCHLIST_ADD' | 'WATCHLIST_REMOVE' | string;
  targetType?: string | null;
  targetId?: string | null;
  detail?: string | null;
  createdAt: string;
}

export interface RegisterRequest {
  username: string;
  email: string;
  password: string;
  displayName?: string;
}

export interface AddWatchlistRequest {
  animeId: number;
  title?: string | null;
  cover?: string | null;
}

export interface RecordWatchRequest {
  animeId: number;
  episode?: number | null;
  provider?: string | null;
  title?: string | null;
  cover?: string | null;
}
