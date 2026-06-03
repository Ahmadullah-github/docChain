import type { CSSProperties, PointerEvent, ReactNode, RefObject } from "react";
import { cx } from "../../../../lib/classNames";

type TemplateBuilderShellProps = {
  canvas: ReactNode;
  error?: ReactNode;
  gridRef: RefObject<HTMLDivElement | null>;
  gridStyle?: CSSProperties;
  onResetSplitter: () => void;
  rail?: ReactNode;
  resizing: boolean;
  ribbon: ReactNode;
  splitPanelsVisible: boolean;
  splitterHandlers: {
    onPointerCancel: (event: PointerEvent<HTMLButtonElement>) => void;
    onPointerDown: (event: PointerEvent<HTMLButtonElement>) => void;
    onPointerMove: (event: PointerEvent<HTMLButtonElement>) => void;
    onPointerUp: (event: PointerEvent<HTMLButtonElement>) => void;
  };
};

function TemplateBuilderSplitter({
  dragging,
  onPointerCancel,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onReset
}: {
  dragging: boolean;
  onPointerCancel: (event: PointerEvent<HTMLButtonElement>) => void;
  onPointerDown: (event: PointerEvent<HTMLButtonElement>) => void;
  onPointerMove: (event: PointerEvent<HTMLButtonElement>) => void;
  onPointerUp: (event: PointerEvent<HTMLButtonElement>) => void;
  onReset: () => void;
}) {
  return (
    <button
      aria-label="Resize builder panels"
      className={cx(
        "group hidden cursor-col-resize touch-none items-stretch justify-center px-1 outline-none transition xl:flex",
        dragging && "bg-[#061d49]/5"
      )}
      onDoubleClick={onReset}
      onPointerCancel={onPointerCancel}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      title="Drag to resize panels. Double click to reset."
      type="button"
    >
      <span className={cx(
        "my-2 flex w-3 items-center justify-center rounded-full border border-slate-200 bg-white shadow-sm transition group-hover:border-[#061d49]/30 group-hover:bg-[#061d49]/5 group-focus-visible:border-[#061d49]/40 group-focus-visible:bg-[#061d49]/5",
        dragging && "border-[#061d49]/40 bg-[#061d49]/10"
      )}>
        <span className={cx("h-10 w-1 rounded-full bg-slate-300 transition group-hover:bg-[#061d49]", dragging && "bg-[#061d49]")} />
      </span>
    </button>
  );
}

export function TemplateBuilderShell({
  canvas,
  error,
  gridRef,
  gridStyle,
  onResetSplitter,
  rail,
  resizing,
  ribbon,
  splitPanelsVisible,
  splitterHandlers
}: TemplateBuilderShellProps) {
  return (
    <div className="space-y-2">
      {error ? <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{error}</div> : null}
      {ribbon}
      <div
        className={cx("grid min-w-0", splitPanelsVisible ? "gap-0 xl:grid-cols-[var(--template-builder-columns)]" : "gap-3 xl:grid-cols-1")}
        ref={gridRef}
        style={gridStyle}
      >
        {splitPanelsVisible ? (
          <aside className="min-w-0 overflow-y-auto pe-2 xl:h-[calc(100vh-7.25rem)]">
            {rail}
          </aside>
        ) : null}

        {splitPanelsVisible ? (
          <TemplateBuilderSplitter
            dragging={resizing}
            onReset={onResetSplitter}
            {...splitterHandlers}
          />
        ) : null}

        {canvas}
      </div>
    </div>
  );
}
