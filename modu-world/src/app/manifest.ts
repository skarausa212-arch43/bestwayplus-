import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "MODU WORLD",
    short_name: "MODU",
    description: "Collectible NFC toys, MODU School and rewards.",
    start_url: "/dashboard",
    scope: "/",
    display: "standalone",
    background_color: "#151515",
    theme_color: "#151515",
    orientation: "portrait",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icon-maskable.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
