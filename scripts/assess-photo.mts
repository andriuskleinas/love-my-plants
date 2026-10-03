// Dev tool: run the AI plant assessment on local photos without the app.
// Usage: npm run assess -- [--emergency] <photo.jpg> [soil.jpg] [spot.jpg]
import { readFileSync } from "node:fs";
import { extname } from "node:path";

process.loadEnvFile(".env.local");

const { assessPlant } = await import("../src/lib/ai/assess");

const kinds = ["whole", "soil", "spot"] as const;
const args = process.argv.slice(2);
const emergency = args.includes("--emergency");
const files = args.filter((a) => a !== "--emergency");
if (!files.length) {
  console.error("Usage: npm run assess -- <photo.jpg> [soil.jpg] [spot.jpg]");
  process.exit(1);
}

const photos = files.slice(0, 3).map((file, i) => ({
  kind: kinds[i],
  mediaType: (extname(file).toLowerCase() === ".png" ? "image/png" : "image/jpeg") as "image/png" | "image/jpeg",
  base64: readFileSync(file).toString("base64"),
}));

const started = Date.now();
const result = await assessPlant(photos, {
  potDiameterCm: 17,
  potMaterial: "plastic",
  hasDrainage: true,
  waterAmountMl: 400,
  windowDirection: "E",
  hemisphere: "north",
  today: new Date(),
  emergency,
  symptoms: emergency ? ["Yellow leaves", "Drooping or wilting"] : undefined,
});
console.log(JSON.stringify(result, null, 2));
console.error(`\n${((Date.now() - started) / 1000).toFixed(1)}s`);
