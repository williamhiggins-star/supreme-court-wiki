import Link from "next/link";
import { getAppellateImpactsData } from "@/lib/appellate-impacts";
import { AppellateImpactsSection } from "@/components/AppellateImpactsSection";

export const metadata = {
  title: "Appellate Impacts · Supreme Court Tracker",
  description:
    "Recent federal appellate opinions with significant business impact — securities, antitrust, labor & employment, IP, arbitration, class actions, and bankruptcy.",
};

export default function AppellateImpactsPage() {
  const data = getAppellateImpactsData();

  return (
    <main className="min-h-screen bg-[var(--cream)]">
      <header className="bg-[var(--cream)] pt-10 px-6 pb-6">
        <div className="max-w-5xl mx-auto">
          <Link
            href="/"
            className="text-[var(--warm-gray)] hover:text-[var(--rust)] transition-colors"
            style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "12px", textTransform: "uppercase", letterSpacing: "0.08em" }}
          >
            &larr; Supreme Court Tracker
          </Link>
          <h1
            className="mt-4 text-3xl sm:text-4xl font-bold text-[var(--charcoal)] tracking-tight"
            style={{ fontFamily: "'Playfair Display', Georgia, serif" }}
          >
            Appellate Impacts
          </h1>
          <p className="mt-2 text-[var(--warm-gray)] max-w-2xl" style={{ fontFamily: "'Lora', Georgia, serif", fontSize: "15px" }}>
            Recent federal appellate opinions with significant business impact.
            Covering securities, antitrust, labor &amp; employment, intellectual
            property, arbitration, class actions, and bankruptcy. Court badges
            link to the full opinion on CourtListener.
          </p>
        </div>
      </header>

      <section className="max-w-5xl mx-auto px-6 py-10">
        {data ? (
          <AppellateImpactsSection
            impacts={data.impacts}
            generated={data.generated}
          />
        ) : (
          <p className="text-[var(--warm-gray)] text-sm italic" style={{ fontFamily: "'Lora', Georgia, serif" }}>
            No data yet — run{" "}
            <code
              className="bg-[var(--ivory)] px-1 py-0.5 rounded border border-[var(--tan)]"
              style={{ fontFamily: "'DM Mono', monospace", fontSize: "12px" }}
            >
              npx tsx scripts/fetch-appellate-impacts.ts
            </code>{" "}
            to populate.
          </p>
        )}
      </section>
    </main>
  );
}
