export interface PaginationParams {
  page: number;
  pageSize: number;
}

export interface PaginatedResult<T> {
  data: T[];
  totalCount: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export const PAGE_SIZE_OPTIONS = [5, 25, 50, 100] as const;
export const DEFAULT_PAGE_SIZE = 25;