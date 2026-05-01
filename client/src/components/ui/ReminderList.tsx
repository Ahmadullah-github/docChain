import type { ReactNode } from "react";
import { Icon } from "./Icon";
import type { IconName } from "./Icon";

type Reminder = {
  icon: IconName;
  text: ReactNode;
};

type ReminderListProps = {
  items: Reminder[];
};

export function ReminderList({ items }: ReminderListProps) {
  return (
    <div className="overflow-hidden rounded-lg border border-slate-200/80 bg-white">
      {items.map((item, index) => (
        <div className="flex items-start gap-3 border-b border-slate-100 px-4 py-3 last:border-b-0" key={index}>
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-blue-50 text-[#061d49]">
            <Icon className="h-5 w-5" name={item.icon} />
          </span>
          <p className="text-sm leading-6 text-slate-600">{item.text}</p>
        </div>
      ))}
    </div>
  );
}
