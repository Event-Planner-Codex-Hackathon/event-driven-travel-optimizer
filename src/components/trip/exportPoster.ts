import type { RouteOption } from "@/contract/trip";
import { formatRange } from "@/lib/format";
import { posterCities, routeDates, safePosterUrl } from "./poster";

/** The image is decorative. Every printed route fact comes from the selected backend result. */
export async function downloadPoster(option: RouteOption, imageUrl: string, preview = false): Promise<void> {
  const url = safePosterUrl(imageUrl);
  if (!url) throw new Error("The artwork URL cannot be exported.");
  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    const timer = window.setTimeout(() => { img.src = ""; reject(new Error("Artwork download timed out. Try again.")); }, 15_000);
    img.crossOrigin = "anonymous";
    img.onload = () => { window.clearTimeout(timer); resolve(img); };
    img.onerror = () => { window.clearTimeout(timer); reject(new Error("The image host did not allow a poster download. You can still view the artwork.")); };
    img.src = url;
  });
  const canvas = document.createElement("canvas");
  canvas.width = 1080;
  canvas.height = 1350;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("This browser cannot export a poster.");
  ctx.fillStyle = "#09162a";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const scale = Math.max(canvas.width / image.naturalWidth, canvas.height / image.naturalHeight);
  const w = image.naturalWidth * scale, h = image.naturalHeight * scale;
  ctx.drawImage(image, (canvas.width - w) / 2, (canvas.height - h) / 2, w, h);
  const shade = ctx.createLinearGradient(0, 300, 0, 1350);
  shade.addColorStop(0, "rgba(9,22,42,0.05)");
  shade.addColorStop(0.5, "rgba(9,22,42,0.8)");
  shade.addColorStop(1, "#09162a");
  ctx.fillStyle = shade;
  ctx.fillRect(0, 0, 1080, 1350);
  ctx.fillStyle = "#8fcbfe";
  ctx.beginPath();
  ctx.roundRect(60, 60, 70, 70, 18);
  ctx.fill();
  ctx.save();
  ctx.translate(60, 60);
  ctx.scale(70 / 32, 70 / 32);
  ctx.strokeStyle = "#09162a";
  ctx.lineWidth = 3.5;
  ctx.lineCap = ctx.lineJoin = "round";
  ctx.stroke(new Path2D("M9 26V13a7 7 0 1 1 7 7H9"));
  ctx.fillStyle = "#09162a";
  ctx.beginPath(); ctx.arc(16, 13, 2, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
  ctx.fillStyle = "#edf4ff";
  ctx.font = "700 48px system-ui";
  ctx.fillText("Pookie", 150, 112);

  function lines(text: string, y: number, font: string, lineHeight: number, maxWidth = 960) {
    ctx!.font = font;
    let line = "";
    for (const word of text.split(/\s+/)) {
      const next = line ? `${line} ${word}` : word;
      if (line && ctx!.measureText(next).width > maxWidth) {
        ctx!.fillText(line, 60, y); y += lineHeight; line = word;
      } else line = next;
    }
    if (line) { ctx!.fillText(line, 60, y); y += lineHeight; }
    return y;
  }
  const cities = posterCities(option);
  const titleHeight = cities.reduce((sum, city) => sum + (city.length > 20 ? 190 : 95), 0);
  let y = Math.max(400, 970 - titleHeight);
  ctx.fillStyle = "#8fcbfe";
  ctx.font = "600 26px system-ui";
  ctx.fillText("YOUR NEXT CHAPTER", 60, y); y += 80;
  ctx.fillStyle = "#edf4ff";
  for (const city of cities) y = lines(city, y, "700 78px system-ui", 95);
  const dates = routeDates(option);
  y = lines(formatRange(dates.start, dates.end), y + 10, "500 30px system-ui", 42);
  y = lines(`${option.event.name} · ${option.event.city}`, y + 28, "700 32px system-ui", 42);
  lines(formatRange(option.event.startDate, option.event.endDate), y, "400 28px system-ui", 38);
  ctx.fillStyle = "#8fcbfe";
  ctx.font = "400 22px system-ui";
  ctx.fillText(preview ? "Synthetic layout preview · No fal.ai call · Not a booking" : "AI-generated artwork with fal.ai · Planned itinerary, not a booking", 60, 1290);
  const blob = await new Promise<Blob>((resolve, reject) => {
    try { canvas.toBlob((value) => value ? resolve(value) : reject(new Error("Poster export failed.")), "image/png"); }
    catch { reject(new Error("The image host did not allow a poster download. You can still view the artwork.")); }
  });
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = objectUrl;
  link.download = `pookie-route-${option.label.toLowerCase()}-poster.png`;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 30_000);
}
