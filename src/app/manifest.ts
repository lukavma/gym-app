import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Gym App",
    short_name: "Gym App",
    description: "Personal strength training tracker.",
    start_url: "/today",
    display: "standalone",
    orientation: "portrait",
    background_color: "#0f172a",
    theme_color: "#0f172a",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      {
        src: "/icons/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
