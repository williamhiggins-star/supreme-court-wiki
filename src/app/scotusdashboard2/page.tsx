import { getScotusDashboard2Data } from "@/lib/scotusdashboard2-data";
import { ScotusDashboard2Client } from "@/components/ScotusDashboard2Client";

// Same revalidation cadence as the homepage, so "Today"/"Tomorrow" badges
// stay accurate.
export const revalidate = 3600;

export default async function ScotusDashboard2({
  searchParams,
}: {
  searchParams: Promise<{ case?: string }>;
}) {
  // ?case=<slug> deep-links straight into a case's detail view on load --
  // this is the only case-detail URL that resolves DB-only cases (no
  // data/cases/*.json file), which /cases/[slug] can't. See
  // ScotusDashboard2Client's initialCaseSlug prop and /docket/[column]'s
  // case links.
  const { case: initialCaseSlug } = await searchParams;

  const data = await getScotusDashboard2Data();

  return <ScotusDashboard2Client {...data} initialCaseSlug={initialCaseSlug ?? null} />;
}
