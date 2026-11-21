"use client";

import { useEffect, useRef, useState } from "react";
import { Info } from "lucide-react";

interface InfoHintProps {
  title?: string;
  text: string;
  align?: "left" | "right" | "center";
  light?: boolean;
}

/**
 * Tap- and hover-friendly visual cue popover for explaining LHDN terms and app actions
 * cleanly on both mobile touchscreens and desktop browsers.
 */
export function InfoHint({
  title,
  text,
  align = "center",
  light = false,
}: InfoHintProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleOutside(e: MouseEvent | TouchEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleOutside);
    document.addEventListener("touchstart", handleOutside);
    return () => {
      document.removeEventListener("mousedown", handleOutside);
      document.removeEventListener("touchstart", handleOutside);
    };
  }, [open]);

  const positionClass =
    align === "left"
      ? "left-0"
      : align === "right"
      ? "right-0"
      : "left-1/2 -translate-x-1/2";

  return (
    <span
      ref={containerRef}
      className="relative inline-flex items-center align-middle"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        aria-label={title ? `Info: ${title}` : "More information"}
        aria-expanded={open}
        className={`inline-flex h-4 w-4 items-center justify-center rounded-full transition focus:outline-none ${
          light
            ? "text-emerald-100/80 hover:bg-white/15 hover:text-white"
            : "text-slate-400 hover:bg-slate-100 hover:text-emerald-600"
        }`}
      >
        <Info className="h-3.5 w-3.5" />
      </button>

      {open && (
        <span
          role="tooltip"
          className={`absolute bottom-full z-50 mb-2 w-60 rounded-xl border border-slate-200 bg-slate-900 p-2.5 text-left text-[11px] font-normal leading-relaxed text-slate-100 shadow-lg ${positionClass}`}
        >
          {title && (
            <span className="mb-0.5 block text-[11px] font-bold text-emerald-300">
              {title}
            </span>
          )}
          <span>{text}</span>
        </span>
      )}
    </span>
  );
}
