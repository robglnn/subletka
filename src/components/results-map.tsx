"use client";

import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { List, Map as MapIcon } from "lucide-react";
import "maplibre-gl/dist/maplibre-gl.css";
import { cn } from "@/lib/utils";

const STYLE = "https://tiles.openfreemap.org/styles/positron";
const WORKER = "/maplibre-gl-worker.mjs";

export type MapPoint = { id: string; lat: number; lng: number; label: string; href: string };

function ResultsMap({ points, label, className }: { points: MapPoint[]; label: string; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const key = points.map((p) => p.id).join(",");

  useEffect(() => {
    if (!ref.current || !points.length) return;
    let map: import("maplibre-gl").Map | null = null;
    let cancelled = false;
    import("maplibre-gl").then(({ Map, Marker, LngLatBounds, setWorkerUrl }) => {
      if (cancelled || !ref.current) return;
      setWorkerUrl(WORKER);
      const bounds = points.reduce((b, p) => b.extend([p.lng, p.lat]), new LngLatBounds());
      map = new Map({
        container: ref.current,
        style: STYLE,
        bounds,
        fitBoundsOptions: { padding: 48, maxZoom: 14 },
        attributionControl: { compact: true },
        dragRotate: false,
      });
      for (const p of points) {
        const a = document.createElement("a");
        a.href = p.href;
        a.textContent = p.label;
        a.className =
          "block rounded-full bg-white px-2.5 py-1 text-xs font-bold text-foreground shadow-md ring-1 ring-black/10 whitespace-nowrap hover:bg-foreground hover:text-background";
        new Marker({ element: a }).setLngLat([p.lng, p.lat]).addTo(map);
      }
    });
    return () => {
      cancelled = true;
      map?.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return <div ref={ref} role="region" aria-label={label} className={cn("overflow-hidden bg-muted", className)} />;
}

const WIDE = "(min-width: 1024px)";

const subscribeWide = (cb: () => void) => {
  const mq = window.matchMedia(WIDE);
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
};

export function ResultsLayout({
  points,
  labels,
  children,
}: {
  points: MapPoint[];
  labels: { map: string; list: string };
  children: ReactNode;
}) {
  const [view, setView] = useState<"list" | "map">("list");
  const wide = useSyncExternalStore(subscribeWide, () => window.matchMedia(WIDE).matches, () => false);

  const showMap = points.length > 0 && (wide || view === "map");

  return (
    <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)] lg:gap-6">
      <div className={cn(view === "map" && "max-lg:hidden")}>{children}</div>
      {showMap && (
        <ResultsMap
          points={points}
          label={labels.map}
          className="h-[calc(100dvh-10rem)] rounded-2xl max-lg:mb-20 lg:sticky lg:top-20 lg:h-[calc(100dvh-6rem)]"
        />
      )}
      {points.length > 0 && (
        <button
          type="button"
          onClick={() => {
            setView(view === "list" ? "map" : "list");
            window.scrollTo({ top: 0 });
          }}
          className="fixed bottom-[max(1.25rem,env(safe-area-inset-bottom))] left-1/2 z-30 inline-flex h-12 -translate-x-1/2 items-center gap-2 rounded-full bg-foreground px-5 text-base font-semibold text-background shadow-lg lg:hidden"
        >
          {view === "list" ? <MapIcon className="size-5" /> : <List className="size-5" />}
          {view === "list" ? labels.map : labels.list}
        </button>
      )}
    </div>
  );
}
