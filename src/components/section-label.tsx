import { cn } from "@/lib/utils";

export function SectionLabel({
  children,
  as: Tag = "h2",
  className,
}: {
  children: React.ReactNode;
  as?: "h1" | "h2" | "h3";
  className?: string;
}) {
  return (
    <Tag className={cn("font-condensed text-2xl font-bold tracking-tight sm:text-3xl", className)}>
      <span className="text-primary">/</span> {children}
    </Tag>
  );
}
