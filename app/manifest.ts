import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "سكني · Sakani",
    short_name: "Sakani",
    description: "سكن طلابي في الجيزة — Student housing in Giza",
    start_url: "/ar",
    scope: "/",
    display: "standalone",
    lang: "ar",
    dir: "rtl",
    background_color: "#fbfaf7",
    theme_color: "#246b53",
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml" },
      { src: "/app-icon/192", sizes: "192x192", type: "image/png" },
      { src: "/app-icon/512", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
