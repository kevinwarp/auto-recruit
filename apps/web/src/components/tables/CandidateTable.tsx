'use client';

import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type SortingState,
  type RowSelectionState,
} from '@tanstack/react-table';
import { useState } from 'react';
import { Download, ChevronUp, ChevronDown, ChevronsUpDown } from 'lucide-react';
import { cn, outreachStatusColor } from '@/lib/utils';

interface CandidateTableProps<T> {
  data: T[];
  columns: ColumnDef<T>[];
  onExport?: (selectedIds: string[]) => void;
  getRowId?: (row: T) => string;
  extraActions?: React.ReactNode;
  isLoading?: boolean;
  // Pagination
  total?: number;
  page?: number;
  pageSize?: number;
  onPageChange?: (page: number) => void;
}

export function CandidateTable<T>({
  data,
  columns,
  onExport,
  getRowId,
  extraActions,
  isLoading,
  total,
  page = 1,
  pageSize = 50,
  onPageChange,
}: CandidateTableProps<T>) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});

  const table = useReactTable({
    data,
    columns,
    state: { sorting, rowSelection },
    onSortingChange: setSorting,
    onRowSelectionChange: setRowSelection,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getRowId: getRowId ? (row) => getRowId(row) : undefined,
    enableRowSelection: true,
  });

  const selectedIds = Object.keys(rowSelection).filter((k) => rowSelection[k]);
  const totalPages = total ? Math.ceil(total / pageSize) : 1;

  return (
    <div className="flex flex-col gap-4">
      {/* Toolbar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm text-gray-500">
          {selectedIds.length > 0 ? (
            <span>{selectedIds.length} selected</span>
          ) : (
            <span>{total ?? data.length} total</span>
          )}
          <button
            onClick={() => table.toggleAllRowsSelected(true)}
            className="text-brand-600 hover:underline"
          >
            Select all
          </button>
          {selectedIds.length > 0 && (
            <button
              onClick={() => table.resetRowSelection()}
              className="text-gray-400 hover:underline"
            >
              Deselect all
            </button>
          )}
        </div>

        <div className="flex items-center gap-2">
          {extraActions}
          {onExport && (
            <button
              onClick={() => onExport(selectedIds)}
              className="flex items-center gap-1.5 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              <Download className="h-4 w-4" />
              Download CSV
            </button>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white shadow-sm">
        <table className="min-w-full divide-y divide-gray-200 text-sm">
          <thead className="bg-gray-50">
            {table.getHeaderGroups().map((hg) => (
              <tr key={hg.id}>
                {hg.headers.map((header) => (
                  <th
                    key={header.id}
                    className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide whitespace-nowrap"
                    onClick={header.column.getToggleSortingHandler()}
                    style={{ cursor: header.column.getCanSort() ? 'pointer' : 'default' }}
                  >
                    <div className="flex items-center gap-1">
                      {flexRender(header.column.columnDef.header, header.getContext())}
                      {header.column.getCanSort() && (
                        <span className="text-gray-400">
                          {header.column.getIsSorted() === 'asc' ? (
                            <ChevronUp className="h-3 w-3" />
                          ) : header.column.getIsSorted() === 'desc' ? (
                            <ChevronDown className="h-3 w-3" />
                          ) : (
                            <ChevronsUpDown className="h-3 w-3" />
                          )}
                        </span>
                      )}
                    </div>
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody className="divide-y divide-gray-100">
            {isLoading ? (
              <tr>
                <td colSpan={columns.length} className="px-4 py-8 text-center text-gray-400">
                  Loading…
                </td>
              </tr>
            ) : table.getRowModel().rows.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="px-4 py-8 text-center text-gray-400">
                  No results
                </td>
              </tr>
            ) : (
              table.getRowModel().rows.map((row) => (
                <tr
                  key={row.id}
                  className={cn(
                    'hover:bg-gray-50 transition-colors',
                    row.getIsSelected() && 'bg-brand-50',
                  )}
                >
                  {row.getVisibleCells().map((cell) => (
                    <td key={cell.id} className="px-4 py-3 text-gray-700 whitespace-nowrap">
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && onPageChange && (
        <div className="flex items-center justify-between text-sm text-gray-500">
          <span>
            Page {page} of {totalPages} ({total} total)
          </span>
          <div className="flex gap-2">
            <button
              disabled={page <= 1}
              onClick={() => onPageChange(page - 1)}
              className="px-3 py-1 rounded border border-gray-300 disabled:opacity-40 hover:bg-gray-50"
            >
              Previous
            </button>
            <button
              disabled={page >= totalPages}
              onClick={() => onPageChange(page + 1)}
              className="px-3 py-1 rounded border border-gray-300 disabled:opacity-40 hover:bg-gray-50"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Reusable status badge ─────────────────────────────────────────────────────

export function OutreachStatusBadge({ status }: { status: string }) {
  return (
    <span className={cn('inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium capitalize', outreachStatusColor(status))}>
      {status.replace(/_/g, ' ')}
    </span>
  );
}
