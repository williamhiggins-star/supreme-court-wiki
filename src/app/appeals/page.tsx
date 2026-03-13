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
    <main className="min-h-screen bg-ft-paper">
      {/* Header */}
      <header className="bg-ft-pink pt-10 px-6 pb-0">
        <div className="max-w-4xl mx-auto">
          <Link
            href="/"
            className="text-xs font-semibold text-gray-500 hover:text-gray-800 transition-colors"
          >
            ← Supreme Court Tracker
          </Link>
          <h1
            className="mt-3 text-3xl sm:text-4xl font-bold text-gray-900 tracking-tight"
            style={{ fontFamily: "Graphika81, Georgia, serif" }}
          >
            Circuit Splits
          </h1>
          <p className="mt-3 text-sm text-gray-600 max-w-2xl pb-8">
            Active disagreements among the federal circuit courts on questions
            of federal law. Where circuits conflict, the Supreme Court often
            steps in to resolve the split. Cases with ★ are already before the
            Court.
          </p>
        </div>
        <div className="border-t border-[#f0b896]" />
      </header>

      {/* Content */}
      <section className="max-w-4xl mx-auto px-6 py-10">
        {data ? (
          <CircuitSplitsSection splits={data.splits} generated={data.generated} />
        ) : (
          <div className="text-center py-20">
            <p className="text-gray-400 text-sm italic">
              Circuit split data is being generated — check back shortly.
            </p>
          </div>
        )}
      </section>
    </main>
  );
}
