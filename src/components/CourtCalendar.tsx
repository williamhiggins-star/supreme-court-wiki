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
      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        {/* Month nav */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 bg-gray-50">
          <button
            onClick={() => navigate(-1)}
            className="px-2.5 py-1 text-base text-gray-500 hover:bg-gray-200 rounded leading-none"
            aria-label="Previous month"
          >
            ‹
          </button>
          <span className="text-sm font-semibold text-gray-800">
            {MONTHS[month - 1]} {year}
          </span>
          <button
            onClick={() => navigate(1)}
            className="px-2.5 py-1 text-base text-gray-500 hover:bg-gray-200 rounded leading-none"
            aria-label="Next month"
          >
            ›
          </button>
        </div>

        {/* Day name headers */}
        <div className="grid grid-cols-7 border-b border-gray-200">
          {DAYS.map((d) => (
            <div
              key={d}
              className="text-center text-xs font-medium text-gray-400 py-2"
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
                  className="min-h-16 border-b border-r border-gray-100 bg-gray-50/40"
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
                className={`min-h-16 p-1 border-b border-r border-gray-100 ${
                  isToday ? "bg-blue-50" : ""
                }`}
              >
                <span
                  className={`text-xs block text-right mb-0.5 ${
                    isToday
                      ? "text-blue-700 font-bold"
                      : "text-gray-400"
                  }`}
                >
                  {day}
                </span>
                {argEvs.flatMap((ev, ei) =>
                  (ev.cases ?? []).map((c, ci) => (
                    <Link
                      key={`${ei}-${ci}`}
                      href={`/cases/${c.slug}`}
                      className="block text-[10px] leading-tight bg-amber-100 text-amber-800 hover:bg-amber-200 rounded px-1 py-0.5 mb-0.5"
                    >
                      <span className="font-semibold">{c.caseNumber}</span>
                      <span className="block line-clamp-2">{c.title}</span>
                    </Link>
                  ))
                )}
                {confEvs.length > 0 && (
                  <span className="block text-[10px] leading-tight bg-blue-100 text-blue-700 rounded px-1 py-0.5 truncate">
                    Conf.
                  </span>
                )}
              </div>
            );
          })}
        </div>

        {/* Legend */}
        <div className="flex gap-4 px-3 py-2 border-t border-gray-100 bg-gray-50">
          <span className="flex items-center gap-1.5 text-xs text-gray-500">
            <span className="w-2.5 h-2.5 rounded-sm bg-amber-100 border border-amber-300 inline-block" />
            Oral Argument
          </span>
          <span className="flex items-center gap-1.5 text-xs text-gray-500">
            <span className="w-2.5 h-2.5 rounded-sm bg-blue-100 border border-blue-300 inline-block" />
            Conference
          </span>
          <span className="flex items-center gap-1.5 text-xs text-gray-500">
            <span className="w-2.5 h-2.5 rounded-sm bg-blue-50 border border-blue-300 inline-block" />
            Today
          </span>
        </div>
      </div>

      {/* Sidebar: month events */}
      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-200 bg-gray-50">
          <h3 className="text-xs font-bold uppercase tracking-widest text-gray-500">
            {MONTHS[month - 1]} {year}
          </h3>
        </div>
        {monthEvents.length === 0 ? (
          <p className="px-4 py-4 text-xs italic text-gray-400">
            No events this month.
          </p>
        ) : (
          <ul className="divide-y divide-gray-100 overflow-y-auto max-h-[440px]">
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
                    <span className="text-xs text-gray-400">{label}</span>
                    <p className="text-xs font-medium text-blue-700 mt-0.5">
                      Conference
                    </p>
                  </li>
                );
              }

              return (ev.cases ?? []).map((c, j) => (
                <li key={`${i}-${j}`}>
                  <Link
                    href={`/cases/${c.slug}`}
                    className="block px-4 py-2.5 hover:bg-gray-50 transition-colors"
                  >
                    <span className="text-xs text-gray-400">
                      {label} · {c.caseNumber}
                    </span>
                    <p className="text-xs font-medium text-gray-800 mt-0.5 leading-snug">
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
