import type { ReactNode } from "react";

type ActivityItem = {
  title: ReactNode;
  meta?: ReactNode;
  time?: ReactNode;
};

type ActivityTimelineProps = {
  items: ActivityItem[];
};

export function ActivityTimeline({ items }: ActivityTimelineProps) {
  return (
    <ol className="space-y-4">
      {items.map((item, index) => (
        <li className="grid grid-cols-[auto_1fr_auto] gap-3" key={index}>
          <span className="mt-1 h-2.5 w-2.5 rounded-full bg-[#061d49]" />
          <div>
            <p className="text-sm font-semibold text-slate-800">{item.title}</p>
            {item.meta ? <p className="mt-1 text-xs text-slate-500">{item.meta}</p> : null}
          </div>
          {item.time ? <span className="text-xs text-slate-500">{item.time}</span> : null}
        </li>
      ))}
    </ol>
  );
}
