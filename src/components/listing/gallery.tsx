"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Grid2X2, XIcon } from "lucide-react";
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import { fill } from "@/lib/i18n/fill";
import { photoSrc, photoSrcSet, type PhotoKey } from "@/lib/photo";

const MOSAIC: Record<number, string[]> = {
  1: ["col-span-4 row-span-2"],
  2: ["col-span-2 row-span-2", "col-span-2 row-span-2"],
  3: ["col-span-2 row-span-2", "col-span-2", "col-span-2"],
  4: ["col-span-2 row-span-2", "col-span-2", "", ""],
  5: ["col-span-2 row-span-2", "", "", "", ""],
};

type Labels = { allPhotos: string; photoOf: string; close: string };

const leadSizes = (count: number) => (count === 1 ? "(min-width: 768px) 1104px, 100vw" : "(min-width: 768px) 560px, 100vw");

function Img({ src, alt, sizes, className, eager }: { src: PhotoKey; alt: string; sizes: string; className?: string; eager?: boolean }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={photoSrc(src, "full", 960)}
      srcSet={photoSrcSet(src, "full")}
      sizes={sizes}
      alt={alt}
      loading={eager ? "eager" : "lazy"}
      fetchPriority={eager ? "high" : undefined}
      decoding="async"
      className={className}
    />
  );
}

function useSnapIndex(ref: React.RefObject<HTMLDivElement | null>) {
  const [index, setIndex] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onScroll = () => setIndex(Math.round(el.scrollLeft / el.clientWidth));
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, [ref]);
  return index;
}

function Viewer({ photos, alt, start, labels }: { photos: PhotoKey[]; alt: string; start: number; labels: Labels }) {
  const ref = useRef<HTMLDivElement>(null);
  const index = useSnapIndex(ref);
  useEffect(() => {
    const el = ref.current;
    if (el) el.scrollTo({ left: start * el.clientWidth, behavior: "instant" });
  }, [start]);
  const go = (delta: number) => {
    const el = ref.current;
    if (el) el.scrollTo({ left: (index + delta) * el.clientWidth, behavior: "smooth" });
  };
  const btn = "absolute top-1/2 z-10 inline-flex size-12 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-foreground disabled:opacity-0";
  return (
    <div className="relative flex h-full flex-col">
      <div className="flex h-14 items-center justify-between px-4 text-sm text-white">
        <span>{fill(labels.photoOf, { n: index + 1, total: photos.length })}</span>
        <DialogPrimitive.Close aria-label={labels.close} className="inline-flex size-11 items-center justify-center">
          <XIcon className="size-6" />
        </DialogPrimitive.Close>
      </div>
      <div ref={ref} className="no-scrollbar flex flex-1 snap-x snap-mandatory overflow-x-auto">
        {photos.map((src, i) => (
          <div key={src} className="flex h-full w-full shrink-0 snap-center items-center justify-center p-2 sm:p-8">
            <Img src={src} alt={`${alt} ${i + 1}`} sizes="100vw" className="max-h-full max-w-full object-contain" />
          </div>
        ))}
      </div>
      <button type="button" aria-label="←" onClick={() => go(-1)} disabled={index === 0} className={`${btn} left-3`}>
        <ChevronLeft className="size-6" />
      </button>
      <button
        type="button"
        aria-label="→"
        onClick={() => go(1)}
        disabled={index >= photos.length - 1}
        className={`${btn} right-3`}
      >
        <ChevronRight className="size-6" />
      </button>
    </div>
  );
}

export function Gallery({ photos, alt, labels }: { photos: PhotoKey[]; alt: string; labels: Labels }) {
  const [open, setOpen] = useState<number | null>(null);
  const strip = useRef<HTMLDivElement>(null);
  const index = useSnapIndex(strip);
  const show = (i: number) => () => setOpen(i);
  const lead = leadSizes(photos.length);
  return (
    <DialogPrimitive.Root open={open !== null} onOpenChange={(o) => !o && setOpen(null)}>
      <div className="relative -mx-4 sm:mx-0 md:hidden">
        <div ref={strip} className="no-scrollbar flex snap-x snap-mandatory overflow-x-auto">
          {photos.map((src, i) => (
            <button key={src} type="button" onClick={show(i)} className="aspect-[4/3] w-full shrink-0 snap-center">
              <Img src={src} alt={`${alt} ${i + 1}`} sizes={i === 0 ? lead : "100vw"} eager={i === 0} className="size-full object-cover" />
            </button>
          ))}
        </div>
        <span className="pointer-events-none absolute right-3 bottom-3 rounded-sm bg-black/70 px-2 py-1 text-xs font-semibold text-white">
          {index + 1}/{photos.length}
        </span>
      </div>
      <div className="relative hidden h-[460px] grid-cols-4 grid-rows-2 gap-2 md:grid">
        {photos.slice(0, 5).map((src, i, shown) => (
          <button key={src} type="button" onClick={show(i)} className={MOSAIC[shown.length][i]}>
            <Img src={src} alt={`${alt} ${i + 1}`} sizes={i === 0 ? lead : "280px"} eager={i === 0} className="size-full rounded-sm object-cover" />
          </button>
        ))}
        <button
          type="button"
          onClick={show(0)}
          className="absolute right-3 bottom-3 inline-flex h-11 items-center gap-2 rounded-sm bg-white px-4 text-sm font-semibold shadow-sm"
        >
          <Grid2X2 className="size-4" />
          {labels.allPhotos} · {photos.length}
        </button>
      </div>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Backdrop className="fixed inset-0 z-50 bg-black" />
        <DialogPrimitive.Popup className="fixed inset-0 z-50 outline-none">
          <DialogPrimitive.Title className="sr-only">{labels.allPhotos}</DialogPrimitive.Title>
          {open !== null && <Viewer photos={photos} alt={alt} start={open} labels={labels} />}
        </DialogPrimitive.Popup>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
