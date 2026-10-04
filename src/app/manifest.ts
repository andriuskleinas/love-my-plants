import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Love My Plants",
    short_name: "My Plants",
    description: "Snap a photo, get a plant health check and simple care steps.",
    start_url: "/",
    display: "standalone",
    background_color: "#f6f1e4",
    theme_color: "#f6f1e4",
    icons: [
      { src: "/icons/192", sizes: "192x192", type: "image/png" },
      { src: "/icons/512", sizes: "512x512", type: "image/png" },
      { src: "/icons/512?maskable=1", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
