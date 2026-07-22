export function normalizePagination(input = {}, {
  defaultPage = 1,
  defaultPageSize = 100,
  maxPage = 10_000,
  maxPageSize = 200
} = {}) {
  const rawPage = Number(input.page);
  const rawPageSize = Number(input.pageSize);
  const page = Number.isFinite(rawPage)
    ? Math.min(maxPage, Math.max(1, Math.trunc(rawPage)))
    : defaultPage;
  const pageSize = Number.isFinite(rawPageSize)
    ? Math.min(maxPageSize, Math.max(1, Math.trunc(rawPageSize)))
    : defaultPageSize;
  return {
    page,
    pageSize,
    offset: (page - 1) * pageSize
  };
}
