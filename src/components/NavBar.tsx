"use client";

import { useState } from "react";

const NAV_ITEMS = [
  { label: "About", href: "#about" },
  { label: "The Docket", href: "#docket" },
  { label: "Justices", href: "#justices" },
  { label: "Counsel", href: "#counsel" },
  { label: "Circuit Map", href: "#circuit-map" },
  { label: "Court Calendar", href: "#court-calendar" },
  { label: "Circuit Splits", href: "/appeals" },
];

export function NavBar() {
  const [open, setOpen] = useState(false);

  return (
    <nav className="mt-8 border-t border-[#f0b896]">
      {/* Mobile: hamburger button */}
      <div className="flex md:hidden items-center justify-end px-4 py-2">
        <button
          onClick={() => setOpen((o) => !o)}
          aria-label="Toggle menu"
          className="p-2 text-gray-900"
        >
          {open ? (
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          ) : (
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          )}
        </button>
      </div>

      {/* Mobile: dropdown */}
      {open && (
        <div className="md:hidden border-t border-[#f0b896] bg-ft-pink">
          {NAV_ITEMS.map(({ label, href }) => (
            <a
              key={href}
              href={href}
              onClick={() => setOpen(false)}
              className="block px-6 py-3 text-base font-semibold text-gray-900 hover:bg-[#f5c4a0] border-b border-[#f0b896] last:border-b-0"
            >
              {label}
            </a>
          ))}
        </div>
      )}

      {/* Desktop: horizontal nav */}
      <ul className="hidden md:flex justify-center gap-0">
        {NAV_ITEMS.map(({ label, href }) => (
          <li key={href}>
            <a
              href={href}
              className="block px-8 py-4 text-lg font-semibold text-gray-900 hover:bg-[#f5c4a0] transition-colors border-b-2 border-transparent hover:border-gray-900"
            >
              {label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
