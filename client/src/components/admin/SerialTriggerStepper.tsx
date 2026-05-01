import { Icon } from "../ui";

type SerialTriggerStepperProps = {
  labels: string[];
  note: string;
  title: string;
};

export function SerialTriggerStepper({ labels, note, title }: SerialTriggerStepperProps) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
      <div className="grid gap-6 lg:grid-cols-[minmax(220px,360px)_1fr] lg:items-center">
        <div className="flex items-center gap-4">
          <div className="grid h-16 w-16 place-items-center rounded-xl bg-[#061d49] text-white">
            <Icon className="h-9 w-9" name="serial" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-slate-950">{title}</h2>
            <p className="mt-1 text-sm leading-6 text-slate-600">{note}</p>
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-5">
          {labels.map((label, index) => (
            <div className="relative text-center" key={label}>
              <div className="mx-auto grid h-9 w-9 place-items-center rounded-full border border-[#061d49] bg-white text-sm font-bold text-[#061d49]">
                {index + 1}
              </div>
              <p className="mt-2 text-xs font-semibold text-slate-700">{label}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
