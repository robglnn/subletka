"use client";

import { useState } from "react";

export function Description({ text, lang, labels }: { text: string; lang: string | undefined; labels: { more: string; less: string } }) {
  const [open, setOpen] = useState(false);
  const long = text.length > 420 || text.split("\n").length > 6;
  return (
    <div className="flex flex-col items-start gap-3">
      <p lang={lang} data-host-text className={`text-base leading-relaxed whitespace-pre-line ${long && !open ? "line-clamp-6" : ""}`}>
        {text}
      </p>
      {long && (
        <button
          type="button"
          onClick={() => setOpen(!open)}
          className="inline-flex h-11 items-center rounded-sm bg-secondary px-4 text-sm font-semibold"
        >
          {open ? labels.less : labels.more}
        </button>
      )}
    </div>
  );
}
