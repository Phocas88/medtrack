import Papa from 'papaparse';

export function exportToCSV<T extends Record<string, unknown>>(
  data: T[],
  filename: string,
  columns?: { key: keyof T; label: string }[]
) {
  if (data.length === 0) return;

  let csvData: Record<string, unknown>[];

  if (columns) {
    csvData = data.map((row) => {
      const mapped: Record<string, unknown> = {};
      columns.forEach(({ key, label }) => {
        mapped[label] = row[key];
      });
      return mapped;
    });
  } else {
    csvData = data;
  }

  const csv = Papa.unparse(csvData);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${filename}_${new Date().toISOString().split('T')[0]}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}
