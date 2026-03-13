"use client";

import { useState } from "react";
import Link from "next/link";
import type { CalendarEvent } from "@/lib/calendar";

interface Props {
  events: CalendarEvent[];
  today: string; // "YYYY-MM-DD"
}

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function CourtCalendar({ events, today }: Props) {
  const [ty, tm] = today.split("-").map(Number);
  const [year, setYear] = useState(ty);
  const [month, setMonth] = useState(tm); // 1-based

  // Build event lookup
  const byDate = new Map<string, CalendarEvent[]>();
  for (const ev of events) {
    if (!byDate.has(ev.date)) byDate.set(ev.date, []);
    byDate.get(ev.date)!.push(ev);
  }

  function navigate(delta: number) {
    let m = month + delta;
    let y = year;
    if (m > 12) {
      m -= 12;
      y++;
    }
    if (m < 1) {
      m += 12;
      y--;
    }
    setMonth(m);
    setYear(y);
  }

  const ym = `${year}-${String(month).padStart(2, "0")}`;
  const firstDow = new Date(year, month - 1, 1).getDay();
  const daysInMonth = new Date(year, month, 0).getDate();
  const cells: (number | null)[] = [
    ...Array(firstDow).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  const monthEvents = events
    .filter((e) => e.date.startsWith(ym))
    .sort((a, b) => a.date.localeCompare(b.date));

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_272px] gap-6 items-start">
      {/* Calendar grid */}
      <div className="bg-[var(--ivory)] border border-[var(--tan)] rounded-lg overflow-hidden shadow-[0_1px_3px_rgba(0,0,0,0.06)]">
        {/* Month nav */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--tan)] bg-[var(--cream)]">
          <button
            onClick={() => navigate(-1)}
            className="px-2.5 py-1 text-base text-[var(--warm-gray)] hover:bg-[var(--tan)]/20 rounded leading-none"
            aria-label="Previous month"
          >
            ‹
          </button>
          <span
            className="text-[var(--charcoal)]"
            style={{ fontFamily: "'Playfair Display', Georgia, serif", fontWeight: 600, fontSize: "15px" }}
          >
            {MONTHS[month - 1]} {year}
          </span>
          <button
            onClick={() => navigate(1)}
            className="px-2.5 py-1 text-base text-[var(--warm-gray)] hover:bg-[var(--tan)]/20 rounded leading-none"
            aria-label="Next month"
          >
            ›
          </button>
        </div>

        {/* Day name headers */}
        <div className="grid grid-cols-7 border-b border-[var(--tan)]">
          {DAYS.map((d) => (
            <div
              key={d}
              className="text-center text-[var(--warm-gray)] py-2"
              style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.08em" }}
            >
              {d}
            </div>
          ))}
        </div>

        {/* Day cells */}
        <div className="grid grid-cols-7">
          {cells.map((day, i) => {
            if (day === null) {
              return (
                <div
                  key={`blank-${i}`}
                  className="min-h-16 border-b border-r border-[var(--tan)]/30 bg-[var(--cream)]/40"
                />
              );
            }

            const dateStr = `${ym}-${String(day).padStart(2, "0")}`;
            const isToday = dateStr === today;
            const dayEvs = byDate.get(dateStr) ?? [];
            const argEvs = dayEvs.filter((e) => e.type === "argument");
            const confEvs = dayEvs.filter((e) => e.type === "conference");

            return (
              <div
                key={day}
                className={`min-h-16 p-1 border-b border-r border-[var(--tan)]/30 ${
                  isToday ? "ring-2 ring-inset ring-[var(--rust)]" : ""
                }`}
              >
                <span
                  className={`block text-right mb-0.5 ${
                    isToday
                      ? "text-[var(--rust)]"
                      : "text-[var(--warm-gray)]"
                  }`}
                  style={{ fontFamily: "'DM Mono', monospace", fontSize: "11px", fontWeight: isToday ? 700 : 400 }}
                >
                  {day}
                </span>
                {argEvs.flatMap((ev, ei) =>
                  (ev.cases ?? []).map((c, ci) => (
                    <Link
                      key={`${ei}-${ci}`}
                      href={`/cases/${c.slug}`}
                      className="block leading-tight bg-[var(--rust)]/10 text-[var(--rust)] hover:bg-[var(--rust)]/20 rounded px-1 py-0.5 mb-0.5 transition-colors"
                      style={{ fontFamily: "'DM Mono', monospace", fontSize: "10px" }}
                    >
                      <span style={{ fontWeight: 500 }}>{c.caseNumber}</span>
                      <span className="block line-clamp-2">{c.title}</span>
                    </Link>
                  ))
                )}
                {confEvs.length > 0 && (
                  <span
                    className="block leading-tight text-[var(--warm-gray)] rounded px-1 py-0.5 truncate"
                    style={{ fontFamily: "'DM Mono', monospace", fontSize: "10px" }}
                  >
                    Conf.
                  </span>
                )}
              </div>
            );
          })}
        </div>

        {/* Legend */}
        <div className="flex gap-4 px-3 py-2 border-t border-[var(--tan)]/30 bg-[var(--cream)]">
          <span className="flex items-center gap-1.5 text-[var(--warm-gray)]" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: "11px" }}>
            <span className="w-2.5 h-2.5 rounded-sm bg-[var(--rust)]/20 border border-[var(--rust)]/40 inline-block" />
            Oral Argument
          </span>
          <span className="flex items-center gap-1.5 text-[var(--warm-gray)]" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: "11px" }}>
            <span className="w-2.5 h-2.5 rounded-sm border border-[var(--tan)] inline-block" />
            Conference
          </span>
          <span className="flex items-center gap-1.5 text-[var(--warm-gray)]" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: "11px" }}>
            <span className="w-2.5 h-2.5 rounded-sm ring-2 ring-[var(--rust)] inline-block" />
            Today
          </span>
        </div>
      </div>

      {/* Sidebar: month events */}
      <div className="bg-[var(--ivory)] border border-[var(--tan)] rounded-lg overflow-hidden shadow-[0_1px_3px_rgba(0,0,0,0.06)]">
        <div className="px-4 py-3 border-b border-[var(--tan)] bg-[var(--cream)]">
          <h3
            className="text-[var(--warm-gray)]"
            style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.12em" }}
          >
            {MONTHS[month - 1]} {year}
          </h3>
        </div>
        {monthEvents.length === 0 ? (
          <p className="px-4 py-4 italic text-[var(--warm-gray)]" style={{ fontFamily: "'Lora', Georgia, serif", fontSize: "13px" }}>
            No events this month.
          </p>
        ) : (
          <ul className="divide-y divide-[var(--tan)]/30 overflow-y-auto max-h-[440px]">
            {monthEvents.map((ev, i) => {
              const label = new Date(
                ev.date + "T12:00:00"
              ).toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
              });

              if (ev.type === "conference") {
                return (
                  <li key={i} className="px-4 py-2.5">
                    <span className="text-[var(--warm-gray)]" style={{ fontFamily: "'DM Mono', monospace", fontSize: "11px" }}>{label}</span>
                    <p className="text-[var(--warm-gray)] mt-0.5" style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "12px" }}>
                      Conference
                    </p>
                  </li>
                );
              }

              return (ev.cases ?? []).map((c, j) => (
                <li key={`${i}-${j}`}>
                  <Link
                    href={`/cases/${c.slug}`}
                    className="block px-4 py-2.5 hover:bg-[var(--cream)] transition-colors"
                  >
                    <span className="text-[var(--warm-gray)]" style={{ fontFamily: "'DM Mono', monospace", fontSize: "11px" }}>
                      {label} · {c.caseNumber}
                    </span>
                    <p className="text-[var(--charcoal)] mt-0.5 leading-snug" style={{ fontFamily: "'Playfair Display', Georgia, serif", fontWeight: 600, fontSize: "13px" }}>
                      {c.title}
                    </p>
                  </Link>
                </li>
              ));
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
