"use client";

import { useState } from "react";

export function CopyLink({ url, labels }: { url: string; labels: { copy: string; copied: string } }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    await navigator.clipboard.writeText(url).catch(() => undefined);
    setCopied(true);
  };
  return (
    <div className="flex flex-col gap-2 sm:flex-row">
      <input
        readOnly
        value={url}
        onFocus={(e) => e.currentTarget.select()}
        className="h-12 min-w-0 flex-1 rounded-sm border border-input bg-muted px-3 font-mono text-sm"
      />
      <button type="button" onClick={copy} className="h-12 rounded-sm bg-foreground px-5 font-semibold text-background">
        {copied ? labels.copied : labels.copy}
      </button>
    </div>
  );
}
