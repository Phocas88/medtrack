export async function allRows<T>(query: (from: number, to: number) => PromiseLike<{
  data: T[] | null; error: unknown;
}>) {
  const rows: T[] = [];
  const size = 500;
  for (let from = 0; from < 20000; from += size) {
    const { data, error } = await query(from, from + size - 1);
    if (error) throw error;
    rows.push(...(data ?? []));
    if (!data || data.length < size) return rows;
  }
  throw new Error('This query exceeds the supported result limit.');
}
