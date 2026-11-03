import type { Dictionary } from "@/lib/i18n/dictionaries";

export type MapLabels = Dictionary["map"];

export const mapLocale = (title: string, t: MapLabels) => ({
  "Map.Title": title,
  "AttributionControl.ToggleAttribution": t.credits,
  "CooperativeGesturesHandler.WindowsHelpText": t.ctrlZoom,
  "CooperativeGesturesHandler.MacHelpText": t.cmdZoom,
  "CooperativeGesturesHandler.MobileHelpText": t.twoFingers,
});
