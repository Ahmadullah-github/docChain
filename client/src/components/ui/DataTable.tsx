import type { KeyboardEvent, MouseEvent, ReactNode } from "react";
import { cx } from "../../lib/classNames";
import { EmptyState } from "./EmptyState";

export type DataTableColumn<T> = {
  key: string;
  header: ReactNode;
  cell: (row: T, index: number) => ReactNode;
  className?: string;
  hideOnMobile?: boolean;
};

type DataTableProps<T> = {
  columns: Array<DataTableColumn<T>>;
  containerClassName?: string;
  emptyLabel: string;
  getRowClassName?: (row: T, index: number) => string;
  getRowAriaLabel?: (row: T, index: number) => string;
  getRowKey: (row: T, index: number) => string | number;
  onRowClick?: (row: T, index: number) => void;
  rows: T[];
  tableClassName?: string;
};

function isInteractiveTarget(target: EventTarget | null) {
  return target instanceof HTMLElement && Boolean(target.closest("a, button, input, select, textarea, [role='button']"));
}

export function DataTable<T>({
  columns,
  containerClassName,
  emptyLabel,
  getRowAriaLabel,
  getRowClassName,
  getRowKey,
  onRowClick,
  rows,
  tableClassName
}: DataTableProps<T>) {
  if (!rows.length) {
    return <EmptyState label={emptyLabel} />;
  }

  function handleRowClick(row: T, rowIndex: number, event: MouseEvent<HTMLTableRowElement>) {
    if (!onRowClick || isInteractiveTarget(event.target)) {
      return;
    }

    onRowClick(row, rowIndex);
  }

  function handleRowKeyDown(row: T, rowIndex: number, event: KeyboardEvent<HTMLTableRowElement>) {
    if (!onRowClick || isInteractiveTarget(event.target) || (event.key !== "Enter" && event.key !== " ")) {
      return;
    }

    event.preventDefault();
    onRowClick(row, rowIndex);
  }

  return (
    <div className={cx("min-w-0 w-full max-w-none overflow-x-auto rounded-lg border border-slate-200", containerClassName)}>
      <table className={cx("min-w-full border-separate border-spacing-0 text-sm", tableClassName)}>
        <thead>
          <tr className="text-start text-xs font-bold uppercase tracking-wide text-slate-500">
            {columns.map((column) => (
              <th
                className={cx(
                  "border-b border-slate-200 bg-slate-50/90 px-3 py-2.5 text-start whitespace-nowrap",
                  column.hideOnMobile && "hidden md:table-cell",
                  column.className
                )}
                key={column.key}
              >
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rowIndex) => (
            <tr
              aria-label={getRowAriaLabel?.(row, rowIndex)}
              className={cx(
                "group",
                onRowClick && "cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#061d49]/20",
                getRowClassName?.(row, rowIndex)
              )}
              key={getRowKey(row, rowIndex)}
              onClick={(event) => handleRowClick(row, rowIndex, event)}
              onKeyDown={(event) => handleRowKeyDown(row, rowIndex, event)}
              tabIndex={onRowClick ? 0 : undefined}
            >
              {columns.map((column) => (
                <td
                  className={cx(
                    "border-b border-slate-100 px-3 py-2.5 align-middle text-slate-700 transition-colors group-hover:bg-slate-50/70",
                    column.hideOnMobile && "hidden md:table-cell",
                    column.className
                  )}
                  key={column.key}
                >
                  {column.cell(row, rowIndex)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
