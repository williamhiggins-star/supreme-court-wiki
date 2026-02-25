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
    <main className="min-h-screen bg-ft-paper">
      <header className="bg-ft-pink pt-10 px-6 pb-6">
        <div className="max-w-5xl mx-auto">
          <Link
            href="/"
            className="text-sm text-gray-600 hover:text-gray-900 hover:underline"
          >
            &larr; Supreme Court Tracker
          </Link>
          <h1
            className="mt-4 text-3xl sm:text-4xl font-bold text-gray-900 tracking-tight"
            style={{ fontFamily: "Graphika81, Georgia, serif" }}
          >
            Appellate Impacts
          </h1>
          <p className="mt-2 text-sm text-gray-600 max-w-2xl">
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
          <p className="text-sm text-gray-400 italic">
            No data yet — run{" "}
            <code className="text-xs bg-gray-100 px-1 py-0.5 rounded">
              npx tsx scripts/fetch-appellate-impacts.ts
            </code>{" "}
            to populate.
          </p>
        )}
      </section>
    </main>
  );
}
