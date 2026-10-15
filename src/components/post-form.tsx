"use client";

import { useActionState, useEffect, useRef, useState, startTransition } from "react";
import { ImagePlus, XIcon } from "lucide-react";
import { fieldClass, labelClass } from "@/components/field";
import { sticker } from "@/components/sticker";
import { CANCELLATIONS, CITIES, GENDERS, PLACE_TYPES, type City, type Locale, type PlaceType } from "@/lib/domain";
import type { Dictionary } from "@/lib/i18n/dictionaries";
import { fill } from "@/lib/i18n/fill";
import { formatMoney, listingTitle } from "@/lib/i18n/format";
import { LOCALE_CURRENCY, ROUND_TO } from "@/lib/money";
import { DEPOSIT_TERMS, MAX_PHOTOS, type FormField, type FormState, type FormValues } from "@/lib/native-form";
import { cn } from "@/lib/utils";

type Action = (state: FormState, fd: FormData) => Promise<FormState>;
type NewPhoto = { key: string; blob: Blob; url: string };

const MAX_EDGE = 1600;

const toBlob = (canvas: HTMLCanvasElement, type: string, quality: number) =>
  new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality));

async function resize(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const webp = await toBlob(canvas, "image/webp", 0.82);
  if (webp?.type === "image/webp") return webp;
  const jpeg = await toBlob(canvas, "image/jpeg", 0.85);
  if (!jpeg) throw new Error("encode failed");
  return jpeg;
}

function Pills<T extends string>({
  name,
  options,
  value,
  onChange,
  labels,
}: {
  name: string;
  options: readonly T[];
  value: T;
  onChange: (v: T) => void;
  labels: Record<T, string>;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((o) => (
        <label
          key={o}
          className={cn(
            "inline-flex h-11 cursor-pointer items-center rounded-xl border px-4 text-base font-medium",
            value === o ? "border-foreground bg-foreground text-background" : "border-input",
          )}
        >
          <input type="radio" name={name} value={o} checked={value === o} onChange={() => onChange(o)} className="sr-only" />
          {labels[o]}
        </label>
      ))}
    </div>
  );
}

const STEP_FIELDS: FormField[][] = [
  [],
  ["availableFrom", "availableTo", "minStayMonths", "price", "depositTerm", "deposit", "bills", "additionalCosts", "cancellationPolicy"],
  ["city", "district", "placeType", "rooms", "roommatesCount", "roommatesGender", "furnished", "pets", "description", "contactEmail"],
];
const READY = STEP_FIELDS.length;

const stepFor = (state: FormState) => {
  if (state.kind !== "error") return null;
  if (state.code === "photos") return 0;
  const i = STEP_FIELDS.findIndex((fields) => fields.some((f) => state.fields.includes(f)));
  return i === -1 ? null : i;
};

type Preview = { photo: string | undefined; title: string; price: string };

export function PostForm({
  lang,
  action,
  t,
  cities,
  placeTypes,
  districts,
  initial,
  existingPhotos,
  mode,
  savedLabel,
}: {
  lang: Locale;
  action: Action;
  t: Dictionary["post"];
  cities: Record<City, string>;
  placeTypes: Record<PlaceType, string>;
  districts: Record<City, string[]>;
  initial: FormValues;
  existingPhotos: string[];
  mode: "create" | "edit";
  savedLabel: string;
}) {
  const [state, formAction, pending] = useActionState(action, { kind: "idle" });
  const [city, setCity] = useState<City>((initial.city as City) ?? "warszawa");
  const [placeType, setPlaceType] = useState<PlaceType>((initial.placeType as PlaceType) ?? "private_room");
  const [depositTerm, setDepositTerm] = useState(initial.depositTerm ?? "");
  const [photos, setPhotos] = useState<NewPhoto[]>([]);
  const [resizing, setResizing] = useState(false);
  const [step, setStep] = useState(0);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [seenState, setSeenState] = useState(state);
  const form = useRef<HTMLFormElement>(null);
  const top = useRef<HTMLDivElement>(null);
  const stepRefs = useRef<(HTMLDivElement | null)[]>([]);
  const stepped = mode === "create";

  if (state !== seenState) {
    setSeenState(state);
    const back = stepFor(state);
    if (stepped && back !== null) setStep(back);
  }

  useEffect(() => {
    if (state.kind !== "idle") top.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [state]);

  const bad = (f: FormField) => state.kind === "error" && state.fields.includes(f);
  const field = (f: FormField) => ({ name: f, defaultValue: initial[f] ?? "", "aria-invalid": bad(f) || undefined });

  const addPhotos = async (files: FileList | null) => {
    if (!files?.length) return;
    setResizing(true);
    const room = MAX_PHOTOS - photos.length;
    const picked = [...files].slice(0, room);
    const blobs = await Promise.all(picked.map((f) => resize(f).catch(() => null)));
    setPhotos((p) => [
      ...p,
      ...blobs.flatMap((blob, i) => (blob ? [{ key: `${Date.now()}-${i}`, blob, url: URL.createObjectURL(blob) }] : [])),
    ]);
    setResizing(false);
  };

  const submit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (stepped && step !== READY) return;
    const fd = new FormData(e.currentTarget);
    photos.forEach((p, i) => fd.append("photo", p.blob, `photo-${i}.${p.blob.type === "image/webp" ? "webp" : "jpg"}`));
    startTransition(() => formAction(fd));
  };

  const shared = placeType !== "whole_place";
  const shownPhotos = photos.length ? photos.map((p) => p.url) : existingPhotos;

  const goTo = (next: number) => {
    setStep(next);
    top.current?.scrollIntoView({ block: "start" });
  };

  const advance = () => {
    const el = stepRefs.current[step];
    const invalid = el ? [...el.querySelectorAll<HTMLInputElement>("input, select, textarea")].find((i) => !i.checkValidity()) : null;
    if (invalid) {
      invalid.reportValidity();
      return;
    }
    if (step + 1 === READY && form.current) {
      const fd = new FormData(form.current);
      const get = (k: FormField) => String(fd.get(k) ?? "");
      const rooms = Number(get("rooms")) || null;
      setPreview({
        photo: shownPhotos[0],
        title: listingTitle(lang, { placeType, rooms, district: get("district") || null, city }),
        price: formatMoney(lang, { amount: Number(get("price")) || 0, currency: LOCALE_CURRENCY[lang] }),
      });
    }
    goTo(step + 1);
  };

  const yesNo = (f: FormField) => (
    <select {...field(f)} className={fieldClass}>
      <option value="">{t.unknown}</option>
      <option value="yes">{t.yes}</option>
      <option value="no">{t.no}</option>
    </select>
  );

  const stepBox = (i: number, children: React.ReactNode) => (
    <div
      ref={(el) => {
        stepRefs.current[i] = el;
      }}
      hidden={stepped && step !== i}
      className="flex flex-col gap-8"
    >
      {children}
    </div>
  );

  const errorLine = state.kind === "error" && <p className="border-l-4 border-primary pl-3 text-base text-primary">{t.errors[state.code]}</p>;

  return (
    <form ref={form} onSubmit={submit} className="flex flex-col gap-8" noValidate>
      <div ref={top} className="flex scroll-mt-20 flex-col gap-3" aria-live="polite">
        {stepped && (
          <div className="flex flex-col gap-2">
            <p className="text-sm font-semibold">
              {step < READY ? `${fill(t.step, { n: step + 1, total: READY })} · ${t.steps[step]}` : t.readyTitle}
            </p>
            <div className="h-1.5 overflow-hidden rounded-full bg-secondary">
              <div className="h-full rounded-full bg-primary transition-[width]" style={{ width: `${(Math.min(step + 1, READY) / READY) * 100}%` }} />
            </div>
          </div>
        )}
        {errorLine}
        {state.kind === "saved" && <p className="border-l-4 border-foreground pl-3 text-base">{savedLabel}</p>}
      </div>

      <input type="text" name="website" tabIndex={-1} autoComplete="off" aria-hidden className="absolute -left-[9999px] h-0 w-0 opacity-0" />

      {stepBox(
        0,
        <fieldset className="flex flex-col gap-3">
          <legend className={labelClass}>{t.photos}</legend>
          <p className="text-sm text-muted-foreground">{mode === "edit" && existingPhotos.length ? t.keepPhotos : t.photosHint}</p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {shownPhotos.map((src, i) => (
              <div key={src} className="relative aspect-[3/4] overflow-hidden rounded-xl bg-muted">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={src} alt="" className="size-full object-cover" />
                {photos.length > 0 && (
                  <button
                    type="button"
                    aria-label={t.removePhoto}
                    onClick={() => setPhotos((p) => p.filter((_, j) => j !== i))}
                    className="absolute top-1 right-1 inline-flex size-11 items-center justify-center rounded-full bg-white/90"
                  >
                    <XIcon className="size-4" />
                  </button>
                )}
              </div>
            ))}
            {photos.length < MAX_PHOTOS && (
              <label className="flex aspect-[3/4] cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-input text-base font-medium">
                <ImagePlus className="size-7" />
                {resizing ? "…" : t.addPhotos}
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  className="sr-only"
                  onChange={(e) => {
                    addPhotos(e.target.files);
                    e.target.value = "";
                  }}
                />
              </label>
            )}
          </div>
        </fieldset>,
      )}

      {stepBox(
        1,
        <>
          <fieldset className="grid grid-cols-2 gap-3">
            <label className={labelClass}>
              {t.price}
              <input {...field("price")} type="number" inputMode="numeric" min={100} step={ROUND_TO[LOCALE_CURRENCY[lang]]} required className={fieldClass} />
            </label>
            <label className={labelClass}>
              {t.deposit}
              <select {...field("depositTerm")} onChange={(e) => setDepositTerm(e.target.value)} className={fieldClass}>
                <option value="">{t.unknown}</option>
                {DEPOSIT_TERMS.map((d) => (
                  <option key={d} value={d}>
                    {t.depositOptions[d]}
                  </option>
                ))}
              </select>
            </label>
            {depositTerm === "amount" && (
              <label className={labelClass}>
                {t.depositAmount}
                <input {...field("deposit")} type="number" inputMode="numeric" min={1} step={ROUND_TO[LOCALE_CURRENCY[lang]]} required className={fieldClass} />
              </label>
            )}
            <label className={labelClass}>
              {t.bills}
              {yesNo("bills")}
            </label>
            <label className={cn(labelClass, "col-span-2")}>
              {t.additionalCosts}
              <input {...field("additionalCosts")} maxLength={300} placeholder={t.additionalCostsHint} className={fieldClass} />
            </label>
            <label className={cn(labelClass, "col-span-2")}>
              {t.cancellation}
              <select {...field("cancellationPolicy")} className={fieldClass}>
                <option value="">{t.unknown}</option>
                {CANCELLATIONS.map((c) => (
                  <option key={c} value={c}>
                    {t.cancellationOptions[c]}
                  </option>
                ))}
              </select>
            </label>
          </fieldset>
          <fieldset className="grid grid-cols-2 gap-3">
            <label className={labelClass}>
              {t.availableFrom}
              <input {...field("availableFrom")} type="date" required className={fieldClass} />
            </label>
            <label className={labelClass}>
              {t.availableTo}
              <input {...field("availableTo")} type="date" className={fieldClass} />
            </label>
            <p className="col-span-2 -mt-1 text-sm text-muted-foreground">{t.availableToHint}</p>
            <label className={cn(labelClass, "col-span-2")}>
              {t.minStay}
              <input {...field("minStayMonths")} type="number" inputMode="numeric" min={1} max={24} className={fieldClass} />
            </label>
          </fieldset>
        </>,
      )}

      {stepBox(
        2,
        <>
          <fieldset className="flex flex-col gap-5">
            <div className={labelClass}>
              {t.city}
              <Pills name="city" options={CITIES} value={city} onChange={setCity} labels={cities} />
            </div>
            <label className={labelClass}>
              {t.district}
              <input {...field("district")} list={`districts-${city}`} placeholder={t.districtHint} autoComplete="off" required minLength={2} className={fieldClass} />
              <datalist id={`districts-${city}`}>
                {districts[city].map((d) => (
                  <option key={d} value={d} />
                ))}
              </datalist>
            </label>
            <div className={labelClass}>
              {t.placeType}
              <Pills name="placeType" options={PLACE_TYPES} value={placeType} onChange={setPlaceType} labels={placeTypes} />
            </div>
            {placeType === "whole_place" && (
              <label className={labelClass}>
                {t.rooms}
                <input {...field("rooms")} type="number" inputMode="numeric" min={1} max={20} className={fieldClass} />
              </label>
            )}
            {shared && (
              <div className="grid grid-cols-2 gap-3">
                <label className={labelClass}>
                  {t.roommatesCount}
                  <input {...field("roommatesCount")} type="number" inputMode="numeric" min={0} max={20} className={fieldClass} />
                </label>
                <label className={labelClass}>
                  {t.roommatesGender}
                  <select {...field("roommatesGender")} className={fieldClass}>
                    <option value="">{t.unknown}</option>
                    {GENDERS.map((g) => (
                      <option key={g} value={g}>
                        {t.gender[g]}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <label className={labelClass}>
                {t.furnished}
                {yesNo("furnished")}
              </label>
              <label className={labelClass}>
                {t.pets}
                {yesNo("pets")}
              </label>
            </div>
          </fieldset>

          <label className={labelClass}>
            {t.description}
            <textarea
              {...field("description")}
              rows={6}
              maxLength={2000}
              placeholder={t.descriptionHint}
              className={cn(fieldClass, "h-auto py-3 leading-relaxed")}
            />
          </label>

          <fieldset className="flex flex-col gap-5 border-t border-border pt-6">
            <legend className="sr-only">{t.contact}</legend>
            <h2 className="text-3xl">{t.contact}</h2>
            <label className={labelClass}>
              {t.contactEmail}
              <input {...field("contactEmail")} type="email" inputMode="email" autoComplete="email" required maxLength={120} className={fieldClass} />
            </label>
            <p className="text-sm text-muted-foreground">{t.contactPrivacy}</p>
          </fieldset>
        </>,
      )}

      {stepped && step === READY && preview && (
        <section className="flex flex-col items-center gap-5">
          <p className="text-center text-base text-muted-foreground">{t.readyLead}</p>
          <div className="relative aspect-[3/4] w-full max-w-xs overflow-hidden rounded-2xl bg-muted">
            {preview.photo && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={preview.photo} alt="" className="absolute inset-0 size-full object-cover" />
            )}
            <span className="absolute inset-x-3 top-[52%] flex flex-col items-center gap-1 text-center">
              <span className="text-[1.05rem]">
                <span className={sticker}>{preview.title}</span>
              </span>
              <span className={cn(sticker, "mt-1 text-sm whitespace-nowrap")}>{preview.price}</span>
            </span>
          </div>
        </section>
      )}

      <div className="sticky bottom-0 -mx-4 flex flex-col gap-3 border-t border-border bg-background px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:static sm:mx-0 sm:border-0 sm:bg-transparent sm:px-0">
        {stepped && step < READY ? (
          <div className="flex gap-3">
            {step > 0 && (
              <button key="back" type="button" onClick={() => goTo(step - 1)} className="h-14 rounded-xl bg-secondary px-6 text-lg font-semibold">
                {t.back}
              </button>
            )}
            <button
              key="next"
              type="button"
              onClick={advance}
              disabled={resizing}
              className="h-14 flex-1 rounded-xl bg-foreground text-lg font-semibold text-background disabled:opacity-60"
            >
              {t.next}
            </button>
          </div>
        ) : (
          <div className="flex gap-3">
            {stepped && (
              <button key="edit" type="button" onClick={() => goTo(0)} className="h-14 rounded-xl bg-secondary px-6 text-lg font-semibold">
                {t.edit}
              </button>
            )}
            <button
              key="submit"
              type="submit"
              disabled={pending || resizing}
              className="h-14 flex-1 rounded-xl bg-primary text-lg font-semibold text-primary-foreground disabled:opacity-60"
            >
              {pending ? t.submitting : mode === "create" ? t.submit : t.save}
            </button>
          </div>
        )}
      </div>
    </form>
  );
}
