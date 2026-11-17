import type { SearchResult } from './types';

export interface SearchManifest {
  sources: { key: string; name: string }[];
  maxPages: number;
}

export interface SearchPageResponse {
  source: string;
  page: number;
  results: SearchResult[];
  pageCount?: number;
  error?: string;
}
