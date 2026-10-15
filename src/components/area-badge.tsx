"use client";

import { useEffect, useId, useRef, useState } from "react";
import { cn } from "@/lib/utils";

export function AreaBadge({ label, className, tipAlign = "start" }: { label: string; className?: string; tipAlign?: "start" | "end" }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLSpanElement>(null);
  const tipId = useId();

  useEffect(() => {
    if (!open) return;
    const close = (e: Event) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !root.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", close);
    };
  }, [open]);

  return (
    <span ref={root} className={cn("relative inline-flex", className)}>
      <button
        type="button"
        aria-label={label}
        aria-describedby={open ? tipId : undefined}
        data-area-badge=""
        className="inline-flex size-11 items-center justify-center outline-offset-[-6px] [-webkit-touch-callout:none] [-webkit-tap-highlight-color:transparent]"
        onPointerEnter={(e) => e.pointerType === "mouse" && setOpen(true)}
        onPointerLeave={(e) => e.pointerType === "mouse" && setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onClick={() => setOpen(true)}
        onContextMenu={(e) => e.preventDefault()}
      >
        <span className="inline-flex size-[22px] items-center justify-center rounded-[4px] bg-primary text-white shadow-[0_0_0_1.5px_white]">
          <svg viewBox="0 0 16 16" width={16} height={16} aria-hidden="true">
            <path
              d="M8.5 1 16 7.5V15H1V7.5ZM8.5 6.5C8.84 8.84 10.16 10.16 12.5 10.5 10.16 10.84 8.84 12.16 8.5 14.5 8.16 12.16 6.84 10.84 4.5 10.5 6.84 10.16 8.16 8.84 8.5 6.5Z"
              fill="currentColor"
              fillRule="evenodd"
            />
          </svg>
        </span>
      </button>
      <span
        id={tipId}
        role="tooltip"
        className={cn(
          "pointer-events-none absolute top-[calc(100%-6px)] z-20 rounded-[4px] bg-foreground px-2 py-1 text-xs leading-normal font-bold tracking-normal whitespace-nowrap text-white transition-opacity [font-stretch:100%]",
          tipAlign === "start" ? "left-[11px]" : "right-[11px]",
          open ? "opacity-100" : "opacity-0",
        )}
      >
        {label}
      </span>
    </span>
  );
}
