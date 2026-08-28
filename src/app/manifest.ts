import type { MetadataRoute } from "next";

/**
 * Vďaka tomuto súboru sa dá appka na telefóne pridať na plochu a otvárať
 * ako bežná aplikácia — bez adresného riadka a s vlastnou ikonou. Na stavbe
 * je to rozdiel medzi „odfotím bloček" a „kde som to mal uložené".
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Doklady — Stavby-Dlhoš",
    short_name: "Doklady",
    description: "Bločky, faktúry a náklady po zákazkách.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#22252a",
    theme_color: "#22252a",
    lang: "sk",
    icons: [
      { src: "/ikona-192.png", sizes: "192x192", type: "image/png" },
      { src: "/ikona-512.png", sizes: "512x512", type: "image/png" },
      { src: "/ikona-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Odfotiť bloček", short_name: "Bloček", url: "/prijate/novy" },
      { name: "Nová faktúra", short_name: "Faktúra", url: "/faktury/nova" },
    ],
  };
}
