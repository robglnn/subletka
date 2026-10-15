import type { MetadataRoute } from "next";
import { RED } from "@/lib/brand";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Subletka",
    short_name: "Subletka",
    description: "Podnajem w Warszawie i Krakowie. Sublets in Warsaw and Kraków.",
    start_url: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: RED,
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
