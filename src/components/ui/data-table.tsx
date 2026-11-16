"use client";

import { useState, useMemo, useId } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
  DropdownMenuCheckboxItem,
} from "@/components/ui/dropdown-menu";
import { Search, ChevronLeft, ChevronRight, Columns3 } from "lucide-react";
export interface Column<T> {
  key: string;
  label: string;
  render?: (row: T) => React.ReactNode;
  sortable?: boolean;
  className?: string;
}
interface DataTableProps<T> {
  data: T[];
  columns: Column<T>[];
  searchKey?: string;
  searchKeys?: string[];
  searchPlaceholder?: string;
  pageSize?: number;
  onRowClick?: (row: T) => void;
  emptyMessage?: string;
  actions?: React.ReactNode;
  loading?: boolean;
  error?: string;
  onRetry?: () => void;
}
function valueAt(row: object, key: string): unknown {
  return (row as Record<string, unknown>)[key];
}
export function DataTable<T extends object>({
  data,
  columns,
  searchKey,
  searchKeys,
  searchPlaceholder = "Search…",
  pageSize = 20,
  onRowClick,
  emptyMessage = "No data found.",
  actions,
  loading = false,
  error,
  onRetry,
}: DataTableProps<T>) {
  const id = useId();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [hidden, setHidden] = useState<string[]>([]);
  const [compact, setCompact] = useState(true);
  const visible = columns.filter((column) => !hidden.includes(column.key));
  const filtered = useMemo(() => {
    const keys = searchKeys || (searchKey ? [searchKey] : []);
    if (!search.trim() || !keys.length) return data;
    const query = search.trim().toLowerCase();
    return data.filter((row) =>
      keys.some((key) =>
        String(valueAt(row, key) ?? "")
          .toLowerCase()
          .includes(query),
      ),
    );
  }, [data, search, searchKey, searchKeys]);
  const sorted = useMemo(() => {
    if (!sortKey) return filtered;
    return [...filtered].sort((a, b) => {
      const left = valueAt(a, sortKey),
        right = valueAt(b, sortKey);
      if (left == null && right == null) return 0;
      if (left == null) return 1;
      if (right == null) return -1;
      const result =
        typeof left === "number" && typeof right === "number"
          ? left - right
          : String(left).localeCompare(String(right), undefined, {
              numeric: true,
            });
      return sortDir === "asc" ? result : -result;
    });
  }, [filtered, sortKey, sortDir]);
  const size = Math.max(1, pageSize);
  const pages = Math.max(1, Math.ceil(sorted.length / size));
  const current = Math.min(page, pages - 1);
  const rows = sorted.slice(current * size, (current + 1) * size);
  function sort(key: string) {
    setSortKey(key);
    setSortDir(sortKey === key && sortDir === "asc" ? "desc" : "asc");
    setPage(0);
  }
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {(searchKey || searchKeys?.length) && (
          <div className="relative min-w-40 max-w-sm flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <label htmlFor={id} className="sr-only">
              {searchPlaceholder}
            </label>
            <Input
              id={id}
              placeholder={searchPlaceholder}
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setPage(0);
              }}
              className="h-10 rounded-sm bg-card pl-9"
            />
          </div>
        )}
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {actions}
          <Button
            variant="outline"
            size="sm"
            aria-pressed={compact}
            onClick={() => setCompact((value) => !value)}
          >
            {compact ? "Compact" : "Comfortable"}
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm">
                <Columns3 className="mr-2 h-3.5 w-3.5" />
                Columns
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {columns
                .filter((column) => column.label)
                .map((column) => (
                  <DropdownMenuCheckboxItem
                    key={column.key}
                    checked={!hidden.includes(column.key)}
                    disabled={
                      visible.filter(item => item.label).length === 1 && !hidden.includes(column.key)
                    }
                    onCheckedChange={(checked) =>
                      setHidden((previous) =>
                        checked
                          ? previous.filter((key) => key !== column.key)
                          : [...previous, column.key],
                      )
                    }
                  >
                    {column.label}
                  </DropdownMenuCheckboxItem>
                ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
      <div className="border bg-card" aria-busy={loading}>
        <Table>
          <TableHeader>
            <TableRow>
              {visible.map((column) => (
                <TableHead
                  key={column.key}
                  aria-sort={
                    sortKey === column.key
                      ? sortDir === "asc"
                        ? "ascending"
                        : "descending"
                      : undefined
                  }
                  className={`${column.className || ""} h-10 bg-muted/30 text-[11px]`}
                >
                  {column.sortable ? (
                    <button
                      type="button"
                      onClick={() => sort(column.key)}
                      className="inline-flex min-h-10 items-center gap-2 text-left"
                    >
                      {column.label}
                      <span aria-hidden="true">
                        {sortKey === column.key
                          ? sortDir === "asc"
                            ? "↑"
                            : "↓"
                          : "↕"}
                      </span>
                    </button>
                  ) : (
                    column.label
                  )}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading || error || rows.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={Math.max(1, visible.length)}
                  className="h-28 text-center text-sm text-muted-foreground"
                >
                  {error ? (
                    <div role="alert" className="space-y-2">
                      <p>{error}</p>
                      {onRetry && (
                        <button
                          type="button"
                          onClick={onRetry}
                          className="underline"
                        >
                          Retry loading
                        </button>
                      )}
                    </div>
                  ) : loading ? (
                    <span role="status">Loading records…</span>
                  ) : search ? (
                    "No matching records. Try another search."
                  ) : (
                    emptyMessage
                  )}
                </TableCell>
              </TableRow>
            ) : (
              rows.map((row, index) => (
                <TableRow
                  key={String(valueAt(row, "id") ?? index)}
                  tabIndex={onRowClick ? 0 : undefined}
                  className={
                    onRowClick
                      ? "cursor-pointer hover:bg-accent/50 focus-visible:bg-accent/50"
                      : ""
                  }
                  onClick={
                    onRowClick
                      ? (event) => {
                          if (
                            !(event.target as HTMLElement).closest(
                              'button,a,input,select,textarea,[role="button"]',
                            )
                          )
                            onRowClick(row);
                        }
                      : undefined
                  }
                  onKeyDown={
                    onRowClick
                      ? (event) => {
                          if (
                            event.target === event.currentTarget &&
                            (event.key === "Enter" || event.key === " ")
                          ) {
                            event.preventDefault();
                            onRowClick(row);
                          }
                        }
                      : undefined
                  }
                >
                  {visible.map((column) => (
                    <TableCell
                      key={column.key}
                      className={`${column.className || ""} ${compact ? "py-2.5 text-xs" : "py-4 text-sm"}`}
                    >
                      {column.render
                        ? column.render(row)
                        : String(valueAt(row, column.key) ?? "—")}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground">
        <span aria-live="polite">
          {loading ? "Loading…" : `${error ? 0 : sorted.length} results`}
        </span>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            aria-label="Previous page"
            onClick={() => setPage(Math.max(0, current - 1))}
            disabled={current === 0 || loading}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span>
            Page {current + 1} of {pages}
          </span>
          <Button
            variant="outline"
            size="sm"
            aria-label="Next page"
            onClick={() => setPage(current + 1)}
            disabled={current >= pages - 1 || loading}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
