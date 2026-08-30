/**
 * term-stats.ts — typed accessors over the term_stats_* views
 * (supabase/migrations/20260831090000_term_stats_views.sql).
 */

import { db } from "./client";
import { currentTermYear } from "./constants";

export async function getOpinionsAuthored(term: string = currentTermYear()) {
  const { data, error } = await db.from("term_stats_opinions_authored").select("*").eq("term", term);
  if (error) throw new Error(`getOpinionsAuthored: ${error.message}`);
  return data ?? [];
}

export async function getWordCountsByAuthor(term: string = currentTermYear()) {
  const { data, error } = await db.from("term_stats_word_counts_by_author").select("*").eq("term", term);
  if (error) throw new Error(`getWordCountsByAuthor: ${error.message}`);
  return data ?? [];
}

export async function getOpinionWordCountExtremes(term: string = currentTermYear()) {
  const { data, error } = await db
    .from("term_stats_opinion_word_count_extremes")
    .select("*")
    .eq("term", term)
    .order("word_count", { ascending: true });
  if (error) throw new Error(`getOpinionWordCountExtremes: ${error.message}`);
  return data ?? [];
}

export async function getAgreementRates(term: string = currentTermYear()) {
  const { data, error } = await db.from("term_stats_agreement").select("*").eq("term", term);
  if (error) throw new Error(`getAgreementRates: ${error.message}`);
  return data ?? [];
}

export async function getMajorityFrequency(term: string = currentTermYear()) {
  const { data, error } = await db.from("term_stats_majority_frequency").select("*").eq("term", term);
  if (error) throw new Error(`getMajorityFrequency: ${error.message}`);
  return data ?? [];
}

export async function getCircuitScorecard(term: string = currentTermYear()) {
  const { data, error } = await db.from("term_stats_circuit_scorecard").select("*").eq("term", term);
  if (error) throw new Error(`getCircuitScorecard: ${error.message}`);
  return data ?? [];
}

export async function getCircuitScorecardDetail(term: string = currentTermYear()) {
  const { data, error } = await db.from("term_stats_circuit_scorecard_detail").select("*").eq("term", term);
  if (error) throw new Error(`getCircuitScorecardDetail: ${error.message}`);
  return data ?? [];
}

export async function getUnanimityRate(term: string = currentTermYear()) {
  const { data, error } = await db.from("term_stats_unanimity_rate").select("*").eq("term", term).maybeSingle();
  if (error) throw new Error(`getUnanimityRate: ${error.message}`);
  return data ?? null;
}

export async function getIdeologicalSplitRate(term: string = currentTermYear()) {
  const { data, error } = await db.from("term_stats_ideological_split_rate").select("*").eq("term", term).maybeSingle();
  if (error) throw new Error(`getIdeologicalSplitRate: ${error.message}`);
  return data ?? null;
}

export async function getDaysToDecisionByAuthor(term: string = currentTermYear()) {
  const { data, error } = await db.from("term_stats_days_to_decision_by_author").select("*").eq("term", term);
  if (error) throw new Error(`getDaysToDecisionByAuthor: ${error.message}`);
  return data ?? [];
}

export async function getCaseCombinedWordCounts(term: string = currentTermYear()) {
  const { data, error } = await db
    .from("term_stats_case_combined_word_counts")
    .select("*")
    .eq("term", term)
    .order("combined_word_count", { ascending: false });
  if (error) throw new Error(`getCaseCombinedWordCounts: ${error.message}`);
  return data ?? [];
}
