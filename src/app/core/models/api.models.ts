/** Text theo ngôn ngữ: { en, ja, vi, ... } */
export type LocalizedText = Record<string, string | null | undefined>;

export interface MediaImages {
  coverXl?: string;
  coverLg?: string;
  coverMd?: string;
  coverColor?: string;
  bannerUrl?: string;
}

export interface ApiError {
  success: false;
  message: string;
  code: string;
}

// ---------- Search ----------
export interface SearchParams {
  title?: string;
  season?: 'WINTER' | 'SPRING' | 'SUMMER' | 'FALL';
  seasonYear?: number;
  status?: string;
  format?: string;
  mediaType?: 'ANIME' | 'MANGA';
  genreIds?: string;
  tagIds?: string;
  sortBy?: 'ID' | 'UPDATED_AT' | 'START_DATE' | 'SEASON_YEAR' | 'POPULARITY';
  sortOrder?: 'ASC' | 'DESC';
  limit?: number;
  offset?: number;
}

export interface MediaSearchResult {
  id: number;
  mediaType: string;
  titles: LocalizedText;
  images?: MediaImages;
  status?: string;
  season?: string;
  seasonYear?: number;
  startDate?: string;
  format?: string;
  /** Tổng số tập (chỉ có ở /browse) */
  totalUnits?: number;
}

// ---------- Browse ----------
export type Season = 'WINTER' | 'SPRING' | 'SUMMER' | 'FALL';
export type BrowseTab = 'TRENDING' | 'POPULAR' | 'SEASON' | 'NEW' | 'AIRING' | 'FINISHED' | 'MOVIE';

export interface BrowseParams {
  tab: BrowseTab;
  season?: Season;
  seasonYear?: number;
  limit?: number;
  offset?: number;
}

export interface SearchResponse {
  success: boolean;
  results: MediaSearchResult[];
  total: number;
  limit: number;
  offset: number;
  /** Offset upstream cho trang tiếp theo (null nếu hết) */
  nextOffset?: number | null;
  hasNextPage: boolean;
}

// ---------- Autocomplete ----------
export interface AutocompleteSuggestion {
  id: number;
  title: string;
  mediaType: string;
}

export interface AutocompleteResponse {
  success: boolean;
  query: string;
  suggestions: AutocompleteSuggestion[];
}

// ---------- Metadata ----------
export interface StreamingProviderMapping {
  providerMediaId: string;
  similarity?: number;
  mappingType?: string;
}

export interface MediaDetail {
  id: number;
  mediaType: string;
  format?: string;
  status?: string;
  source?: string;
  countryOfOrigin?: string;
  startDate?: string;
  endDate?: string;
  season?: string;
  seasonYear?: number;
  totalUnits?: number;
  unitDurationMin?: number;
  titles?: LocalizedText;
  descriptions?: LocalizedText;
  images?: MediaImages;
  trailer?: { site?: string; trailerId?: string; thumbnail?: string };
  genres?: { id: number; name: string }[];
  studios?: { id: number; name: string; isAnimationStudio: boolean; isMain: boolean }[];
  tags?: { id: number; name: string; description?: string }[];
  /** Key = tên provider (ANIMEVIETSUB, NINIYO, ...) */
  streamingProviders?: Record<string, StreamingProviderMapping>;
}

export interface MetadataResponse {
  success: boolean;
  result: MediaDetail;
}

// ---------- Streaming ----------
export interface Episode {
  episodeNumber: string;
  /** Dùng làm episodeData khi gọi /stream/source */
  episodeId: string;
  server: string;
}

export interface EpisodesResponse {
  provider: string;
  limit: number;
  offset: number;
  total: number;
  hasNextPage: boolean;
  episodes: Episode[];
}

export interface ServersResponse {
  provider: string;
  servers: string[];
}

export type StreamType = 'HLS' | 'EMBED' | 'DIRECT';

export interface StreamSource {
  server: string;
  type: StreamType;
  corsProxyRequired: boolean;
  proxyHeaders?: Record<string, string> | null;
  url: string;
}
