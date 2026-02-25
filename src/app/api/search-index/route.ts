import { NextResponse } from "next/server";
import { getAllCases, getAllPrecedents } from "@/lib/data";
import { getCircuitSplitsData } from "@/lib/circuit-splits";
import { getJusticesData } from "@/lib/justices";
import { getLawyersData } from "@/lib/lawyers";

export type SearchItem = {
  type: "case" | "precedent" | "split" | "justice" | "lawyer";
  title: string;
  subtitle: string;
  href: string;
};

export async function GET() {
  const items: SearchItem[] = [];

  // Cases
  for (const c of getAllCases()) {
    items.push({
      type: "case",
      title: c.title,
      subtitle: `${c.termYear} Term · ${c.caseNumber}`,
      href: `/cases/${c.slug}`,
    });
  }

  // Precedents — these are decided SCOTUS cases cited in current cases
  for (const p of getAllPrecedents()) {
    items.push({
      type: "case",
      title: p.name,
      subtitle: `Decided · ${p.year} · ${p.citation}`,
      href: `/precedents/${p.slug}`,
    });
  }

  // Circuit splits
  for (const s of getCircuitSplitsData()?.splits ?? []) {
    items.push({
      type: "split",
      title: s.legalQuestion,
      subtitle: s.area,
      href: "/appeals",
    });
  }

  // Justices
  for (const j of getJusticesData()?.justices ?? []) {
    items.push({
      type: "justice",
      title: j.displayName,
      subtitle: `Justice · ${j.casesParticipated} case${j.casesParticipated !== 1 ? "s" : ""}`,
      href: "/#justices",
    });
  }

  // Counsel
  for (const l of getLawyersData()?.lawyers ?? []) {
    items.push({
      type: "lawyer",
      title: l.name,
      subtitle: `${l.casesArgued} case${l.casesArgued !== 1 ? "s" : ""} argued`,
      href: "/#counsel",
    });
  }

  return NextResponse.json(items);
}
