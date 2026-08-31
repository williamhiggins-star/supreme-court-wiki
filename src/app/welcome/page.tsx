import { getScotusDashboard2Data } from "@/lib/scotusdashboard2-data";
import { ScotusDashboard2LandingClient } from "@/components/ScotusDashboard2LandingClient";

// Same revalidation cadence as /scotusdashboard2 -- this page renders the
// full real dashboard hidden underneath its own carousel/overlay (see
// ScotusDashboard2LandingClient), so it needs the exact same data.
export const revalidate = 3600;

export default async function ScotusDashboard2Landing() {
  const data = await getScotusDashboard2Data();

  return <ScotusDashboard2LandingClient data={data} />;
}
