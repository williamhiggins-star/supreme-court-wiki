import Link from "next/link";
import { getCircuitSplitsData } from "@/lib/circuit-splits";
import { CircuitSplitsSection } from "@/components/CircuitSplitsSection";

export const metadata = {
  title: "Circuit Splits — Supreme Court Tracker",
  description:
    "Active disagreements among federal circuit courts on questions of federal law.",
};

export default function AppealsPage() {
  const data = getCircuitSplitsData();

  return (
    <main className="min-h-screen bg-[var(--cream)]">
      {/* Header */}
      <header className="bg-[var(--cream)] pt-10 px-6 pb-0">
        <div className="max-w-4xl mx-auto">
          <Link
            href="/"
            className="text-[var(--warm-gray)] hover:text-[var(--rust)] transition-colors"
            style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "12px", textTransform: "uppercase", letterSpacing: "0.08em" }}
          >
            &larr; Supreme Court Tracker
          </Link>
          <h1
            className="mt-3 text-3xl sm:text-4xl font-bold text-[var(--charcoal)] tracking-tight"
            style={{ fontFamily: "'Playfair Display', Georgia, serif" }}
          >
            Circuit Splits
          </h1>
          <p className="mt-3 text-[var(--warm-gray)] max-w-2xl pb-8" style={{ fontFamily: "'Lora', Georgia, serif", fontSize: "15px" }}>
            Active disagreements among the federal circuit courts on questions
            of federal law. Where circuits conflict, the Supreme Court often
            steps in to resolve the split. Cases with ★ are already before the
            Court.
          </p>
        </div>
        <div className="border-t border-[var(--tan)]" />
      </header>

      {/* Content */}
      <section className="max-w-4xl mx-auto px-6 py-10">
        {data ? (
          <CircuitSplitsSection splits={data.splits} generated={data.generated} />
        ) : (
          <div className="text-center py-20">
            <p className="text-[var(--warm-gray)] text-sm italic">
              Circuit split data is being generated — check back shortly.
            </p>
          </div>
        )}
      </section>
    </main>
  );
}
