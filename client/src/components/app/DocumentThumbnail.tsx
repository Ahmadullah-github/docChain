import { useState } from "react";
import { Icon } from "../ui";
import { cx } from "../../lib/classNames";

type DocumentThumbnailProps = {
  className?: string;
  subject: string;
  thumbnailUrl?: string | null;
};

export function DocumentThumbnail({ className, subject, thumbnailUrl }: DocumentThumbnailProps) {
  const [failed, setFailed] = useState(false);
  const showImage = Boolean(thumbnailUrl && !failed);

  return (
    <div className={cx("relative aspect-[210/297] overflow-hidden rounded-md border border-slate-200 bg-white shadow-sm", className)}>
      <div className="absolute inset-0 bg-slate-50">
        <div className="flex h-full flex-col p-[10%]">
          <div className="flex items-start justify-between gap-2">
            <span className="grid h-8 w-8 place-items-center rounded-md bg-[#061d49] text-white">
              <Icon className="h-4 w-4" name="document" />
            </span>
            <span className="h-5 w-10 rounded bg-slate-200" />
          </div>
          <div className="mt-5 space-y-2">
            <span className="block h-3 w-3/4 rounded bg-slate-300" />
            <span className="block h-2 w-full rounded bg-slate-200" />
            <span className="block h-2 w-11/12 rounded bg-slate-200" />
            <span className="block h-2 w-4/5 rounded bg-slate-200" />
          </div>
          <div className="mt-auto border-t border-slate-200 pt-3">
            <p className="line-clamp-2 text-[10px] font-bold leading-4 text-slate-500">{subject}</p>
          </div>
        </div>
      </div>
      {showImage ? (
        <img
          alt=""
          className="absolute inset-0 h-full w-full object-cover"
          loading="lazy"
          onError={() => setFailed(true)}
          src={thumbnailUrl || undefined}
        />
      ) : null}
    </div>
  );
}
