import { DOOR, HOUSE_POINTS, RED } from "@/lib/brand";
import { cn } from "@/lib/utils";

export function Mark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 100 100" aria-hidden className={cn("size-8", className)}>
      <circle cx="50" cy="50" r="50" fill={RED} />
      <polygon points={HOUSE_POINTS} fill="#fff" />
      <rect x={DOOR.x} y={DOOR.y} width={DOOR.width} height={DOOR.height} fill={RED} />
    </svg>
  );
}

export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cn("flex items-center gap-2", className)}>
      <Mark className="size-7" />
      <span className="font-condensed text-[1.6rem] leading-none font-bold tracking-tight">subletka</span>
    </span>
  );
}
