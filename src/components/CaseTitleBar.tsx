"use client";

export function CaseTitleBar({
  title,
  onBack,
}: {
  title: string;
  onBack: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-1">
      <span className="font-serif text-[28px] font-normal italic text-[#1A1A1A]">
        {title}
      </span>
      <button
        type="button"
        onClick={onBack}
        className="px-2 py-1 font-serif text-[15px] uppercase tracking-[0.04em] text-[#1A1A1A]"
      >
        ← Back
      </button>
    </div>
  );
}
