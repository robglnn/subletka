"use client";

import { useEffect, useRef, useState } from "react";
import "maplibre-gl/dist/maplibre-gl.css";
import { RED } from "@/lib/brand";

const STYLE = "https://tiles.openfreemap.org/styles/positron";
const WORKER = "/maplibre-gl-worker.mjs";

const circle = ([lat, lng]: readonly [number, number], radiusM: number, steps = 64) => {
  const dLat = radiusM / 111_320;
  const dLng = radiusM / (111_320 * Math.cos((lat * Math.PI) / 180));
  const ring = Array.from({ length: steps + 1 }, (_, i) => {
    const a = (i / steps) * 2 * Math.PI;
    return [lng + dLng * Math.cos(a), lat + dLat * Math.sin(a)];
  });
  return { type: "Feature" as const, properties: {}, geometry: { type: "Polygon" as const, coordinates: [ring] } };
};

export function LocationMap({ center, radiusM, label }: { center: readonly [number, number]; radiusM: number; label: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => e.isIntersecting && setVisible(true), { rootMargin: "300px" });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (!visible || !ref.current) return;
    let map: import("maplibre-gl").Map | null = null;
    let cancelled = false;
    import("maplibre-gl").then(({ Map, LngLatBounds, setWorkerUrl }) => {
      if (cancelled || !ref.current) return;
      setWorkerUrl(WORKER);
      const shape = circle(center, radiusM);
      const bounds = shape.geometry.coordinates[0].reduce(
        (b, c) => b.extend(c as [number, number]),
        new LngLatBounds(),
      );
      map = new Map({
        container: ref.current,
        style: STYLE,
        bounds,
        fitBoundsOptions: { padding: 40 },
        attributionControl: { compact: true },
        cooperativeGestures: true,
        dragRotate: false,
      });
      map.on("load", () => {
        map?.addSource("area", { type: "geojson", data: shape });
        map?.addLayer({ id: "area-fill", type: "fill", source: "area", paint: { "fill-color": RED, "fill-opacity": 0.22 } });
        map?.addLayer({ id: "area-line", type: "line", source: "area", paint: { "line-color": RED, "line-width": 1.5, "line-opacity": 0.6 } });
      });
    });
    return () => {
      cancelled = true;
      map?.remove();
    };
  }, [visible, center, radiusM]);

  return <div ref={ref} role="img" aria-label={label} className="h-72 w-full overflow-hidden rounded-sm bg-muted sm:h-96" />;
}
