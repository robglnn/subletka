"use client";

import { useSyncExternalStore } from "react";
import { Heart } from "lucide-react";
import { parseSaved, SAVED_COOKIE, serializeSaved } from "@/lib/saved";
import { cn } from "@/lib/utils";

const EVENT = "subletka:saved";

const readCookie = () => document.cookie.match(new RegExp(`(?:^|; )${SAVED_COOKIE}=([^;]*)`))?.[1] ?? "";

const subscribe = (cb: () => void) => {
  window.addEventListener(EVENT, cb);
  window.addEventListener("focus", cb);
  return () => {
    window.removeEventListener(EVENT, cb);
    window.removeEventListener("focus", cb);
  };
};

const toggle = (id: string) => {
  const ids = parseSaved(readCookie());
  const next = ids.includes(id) ? ids.filter((x) => x !== id) : [id, ...ids];
  document.cookie = `${SAVED_COOKIE}=${serializeSaved(next)}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
  window.dispatchEvent(new Event(EVENT));
};

export function SaveButton({ id, labels, className }: { id: string; labels: { save: string; unsave: string }; className?: string }) {
  const raw = useSyncExternalStore(subscribe, readCookie, () => "");
  const saved = parseSaved(raw).includes(id);
  return (
    <button
      type="button"
      aria-pressed={saved}
      aria-label={saved ? labels.unsave : labels.save}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        toggle(id);
      }}
      className={cn("inline-flex size-11 items-center justify-center rounded-full", className)}
    >
      <Heart className={cn("size-6 drop-shadow-sm", saved ? "fill-primary text-primary" : "text-white")} strokeWidth={2} />
    </button>
  );
}
