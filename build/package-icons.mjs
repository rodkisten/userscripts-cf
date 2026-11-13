import { createHash } from "node:crypto";

const provider = "https://api.iconify.design";
const categoryIcons = {
  github: "simple-icons:github",
  reddit: "simple-icons:reddit",
  instagram: "simple-icons:instagram",
  productivity: "lucide:rocket",
  development: "lucide:code-xml",
  utilities: "lucide:wrench",
  media: "lucide:play",
  security: "lucide:shield-check",
  social: "lucide:users",
  navigation: "lucide:compass",
  standalone: "lucide:layers-3",
  unified: "lucide:boxes",
};
const palette = [
  ["#8b5cf6", "#4f46e5"],
  ["#0ea5e9", "#2563eb"],
  ["#10b981", "#047857"],
  ["#f97316", "#dc2626"],
  ["#ec4899", "#9333ea"],
  ["#f59e0b", "#ea580c"],
  ["#14b8a6", "#0f766e"],
];
const escapeXml = (value) => String(value).replace(/[&<>"']/g, (char) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;",
})[char]);

export function initials(name) {
  const words = String(name).replace(/[^\p{L}\p{N}]+/gu, " ").trim().split(/\s+/u).filter(Boolean);
  return (words.length > 1 ? words.slice(0, 2).map(word => word[0]).join("") : (words[0] || "US").slice(0, 2)).toUpperCase();
}

function stableColors(category) {
  const hash = createHash("sha256").update(category.toLowerCase()).digest();
  return palette[hash[0] % palette.length];
}

async function providerSymbol(category, fetcher) {
  const icon = categoryIcons[category.toLowerCase()] || "lucide:package";
  const [set, name] = icon.split(":");
  try {
    const response = await fetcher(`${provider}/${set}/${name}.svg?color=%23ffffff`, {
      signal: AbortSignal.timeout(2500),
    });
    if (!response.ok) return "";
    const source = await response.text();
    const match = source.match(/<svg\b[^>]*>([\s\S]*?)<\/svg>/i);
    const viewBox = source.match(/viewBox=["']([^"']+)["']/i)?.[1] || "0 0 24 24";
    if (!match || !/^\d+(?:\.\d+)?(?:\s+\d+(?:\.\d+)?){3}$/.test(viewBox)) return "";
    // Only retain safe drawing primitives; never inline provider scripts, styles or foreignObject.
    const shapes = match[1].match(/<(?:path|circle|rect|line|polyline|polygon|ellipse)\b[^>]*\/?\s*>/gi) || [];
    const safe = shapes.filter(tag => !/\bon\w+\s*=|href\s*=|url\s*\(/i.test(tag)).map(tag => tag.replace(/\s(?:style|class|id)=["'][^"']*["']/gi, ""));
    return safe.length ? `<svg x="72" y="70" width="112" height="112" viewBox="${viewBox}" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" opacity=".92">${safe.join("")}</svg>` : "";
  } catch {
    return "";
  }
}

export async function packageIcon({ name, category, fetcher = fetch }) {
  const label = initials(name);
  const key = String(category || "utilities").toLowerCase();
  const [start, end] = stableColors(key);
  const symbol = await providerSymbol(key, fetcher);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" width="256" height="256"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop stop-color="${start}"/><stop offset="1" stop-color="${end}"/></linearGradient></defs><rect x="5" y="5" width="246" height="246" rx="54" fill="url(#g)"/><rect x="8" y="8" width="240" height="240" rx="51" fill="none" stroke="white" stroke-opacity=".22" stroke-width="4"/><text x="128" y="91" text-anchor="middle" font-family="Arial,sans-serif" font-weight="800" font-size="80" fill="white">${escapeXml(label)}</text>${symbol || '<circle cx="128" cy="130" r="24" fill="white" opacity=".86"/><path d="M82 179h92" stroke="white" stroke-width="13" stroke-linecap="round"/>'}</svg>`;
  return { svg, dataURL: `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}` };
}
