/**
 * fishboneSvgRenderer.ts
 * サーバー側でフィッシュボーン図のSVGを生成し、sharpでPNGに変換する
 */
import sharp from "sharp";

export interface FishboneData {
  effect: string;
  categories: { name: string; causes: string[] }[];
}

const CATEGORY_COLORS = [
  "#ef4444", // 人（Man）
  "#f97316", // 手順（Method）
  "#3b82f6", // 機械・設備（Machine）
  "#22c55e", // 環境（Milieu）
  "#8b5cf6", // 管理（Management）
];

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function wrapText(text: string, maxChars: number): string[] {
  if (text.length <= maxChars) return [text];
  const lines: string[] = [];
  let remaining = text;
  while (remaining.length > maxChars) {
    lines.push(remaining.slice(0, maxChars));
    remaining = remaining.slice(maxChars);
  }
  if (remaining) lines.push(remaining);
  return lines;
}

/**
 * フィッシュボーン図のSVG文字列を生成する
 */
export function generateFishboneSvg(data: FishboneData): string {
  const W = 760;
  const H = 420;
  const SPINE_Y = H / 2;
  const SPINE_START_X = 60;
  const SPINE_END_X = W - 120;
  const HEAD_X = W - 80;

  const topCats = data.categories.filter((_, i) => i === 0 || i === 1);
  const midCat = data.categories[2] ?? null;
  const bottomCats = data.categories.filter((_, i) => i === 3 || i === 4);

  const boneXPositions = [
    SPINE_START_X + (SPINE_END_X - SPINE_START_X) * 0.18,
    SPINE_START_X + (SPINE_END_X - SPINE_START_X) * 0.42,
    SPINE_START_X + (SPINE_END_X - SPINE_START_X) * 0.66,
    SPINE_START_X + (SPINE_END_X - SPINE_START_X) * 0.82,
  ];

  const BONE_ANGLE = 40;
  const BONE_LENGTH = 110;
  const rad = (BONE_ANGLE * Math.PI) / 180;

  const topBones = [
    { rootX: boneXPositions[0]!, cat: topCats[0], colorIdx: 0 },
    { rootX: boneXPositions[2]!, cat: topCats[1], colorIdx: 1 },
  ];
  const bottomBones = [
    { rootX: boneXPositions[1]!, cat: bottomCats[0], colorIdx: 3 },
    { rootX: boneXPositions[3]!, cat: bottomCats[1], colorIdx: 4 },
  ];
  const midBoneRootX = SPINE_START_X + (SPINE_END_X - SPINE_START_X) * 0.54;

  let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">`;

  // 背景
  svg += `<rect width="${W}" height="${H}" fill="#f8fafc"/>`;

  // タイトル
  svg += `<text x="${W / 2 - 40}" y="18" text-anchor="middle" dominant-baseline="middle" fill="#64748b" font-size="11" font-family="sans-serif">特性要因図（フィッシュボーン図）</text>`;

  // 背骨
  svg += `<line x1="${SPINE_START_X}" y1="${SPINE_Y}" x2="${SPINE_END_X}" y2="${SPINE_Y}" stroke="#94a3b8" stroke-width="3" stroke-linecap="round"/>`;
  svg += `<polygon points="${SPINE_END_X},${SPINE_Y} ${SPINE_END_X - 14},${SPINE_Y - 7} ${SPINE_END_X - 14},${SPINE_Y + 7}" fill="#94a3b8"/>`;

  // 魚の頭
  svg += `<ellipse cx="${HEAD_X}" cy="${SPINE_Y}" rx="52" ry="36" fill="#1e293b"/>`;
  svg += `<ellipse cx="${HEAD_X}" cy="${SPINE_Y}" rx="50" ry="34" fill="#334155"/>`;
  svg += `<circle cx="${HEAD_X + 18}" cy="${SPINE_Y - 10}" r="5" fill="white"/>`;
  svg += `<circle cx="${HEAD_X + 20}" cy="${SPINE_Y - 10}" r="3" fill="#1e293b"/>`;
  const effectLines = wrapText(data.effect, 7).slice(0, 3);
  effectLines.forEach((line, i) => {
    const yOff = (i - (effectLines.length - 1) / 2) * 13;
    svg += `<text x="${HEAD_X}" y="${SPINE_Y + yOff}" text-anchor="middle" dominant-baseline="middle" fill="white" font-size="10" font-weight="bold" font-family="sans-serif">${escapeXml(line)}</text>`;
  });

  // 上側の骨
  for (const { rootX, cat, colorIdx } of topBones) {
    if (!cat) continue;
    const tipX = rootX - BONE_LENGTH * Math.cos(rad);
    const tipY = SPINE_Y - BONE_LENGTH * Math.sin(rad);
    const color = CATEGORY_COLORS[colorIdx] ?? "#6366f1";
    svg += `<line x1="${rootX}" y1="${SPINE_Y}" x2="${tipX}" y2="${tipY}" stroke="${color}" stroke-width="2.5" stroke-linecap="round"/>`;
    svg += `<rect x="${tipX - 52}" y="${tipY - 22}" width="104" height="20" rx="4" fill="${color}" opacity="0.9"/>`;
    svg += `<text x="${tipX}" y="${tipY - 12}" text-anchor="middle" dominant-baseline="middle" fill="white" font-size="9" font-weight="bold" font-family="sans-serif">${escapeXml(cat.name)}</text>`;
    cat.causes.slice(0, 3).forEach((cause, ci) => {
      const subX = rootX - (BONE_LENGTH * 0.25 + ci * BONE_LENGTH * 0.22) * Math.cos(rad);
      const subY = SPINE_Y - (BONE_LENGTH * 0.25 + ci * BONE_LENGTH * 0.22) * Math.sin(rad);
      const lines = wrapText(cause, 8).slice(0, 2);
      svg += `<line x1="${subX}" y1="${subY}" x2="${subX - 18}" y2="${subY - 18}" stroke="${color}" stroke-width="1.5" stroke-dasharray="3,2" opacity="0.7"/>`;
      lines.forEach((l, li) => {
        svg += `<text x="${subX - 20}" y="${subY - 20 - li * 11}" text-anchor="end" dominant-baseline="middle" fill="${color}" font-size="8" font-family="sans-serif">${escapeXml(l)}</text>`;
      });
    });
  }

  // 下側の骨
  for (const { rootX, cat, colorIdx } of bottomBones) {
    if (!cat) continue;
    const tipX = rootX - BONE_LENGTH * Math.cos(rad);
    const tipY = SPINE_Y + BONE_LENGTH * Math.sin(rad);
    const color = CATEGORY_COLORS[colorIdx] ?? "#6366f1";
    svg += `<line x1="${rootX}" y1="${SPINE_Y}" x2="${tipX}" y2="${tipY}" stroke="${color}" stroke-width="2.5" stroke-linecap="round"/>`;
    svg += `<rect x="${tipX - 52}" y="${tipY + 2}" width="104" height="20" rx="4" fill="${color}" opacity="0.9"/>`;
    svg += `<text x="${tipX}" y="${tipY + 12}" text-anchor="middle" dominant-baseline="middle" fill="white" font-size="9" font-weight="bold" font-family="sans-serif">${escapeXml(cat.name)}</text>`;
    cat.causes.slice(0, 3).forEach((cause, ci) => {
      const subX = rootX - (BONE_LENGTH * 0.25 + ci * BONE_LENGTH * 0.22) * Math.cos(rad);
      const subY = SPINE_Y + (BONE_LENGTH * 0.25 + ci * BONE_LENGTH * 0.22) * Math.sin(rad);
      const lines = wrapText(cause, 8).slice(0, 2);
      svg += `<line x1="${subX}" y1="${subY}" x2="${subX - 18}" y2="${subY + 18}" stroke="${color}" stroke-width="1.5" stroke-dasharray="3,2" opacity="0.7"/>`;
      lines.forEach((l, li) => {
        svg += `<text x="${subX - 20}" y="${subY + 20 + li * 11}" text-anchor="end" dominant-baseline="middle" fill="${color}" font-size="8" font-family="sans-serif">${escapeXml(l)}</text>`;
      });
    });
  }

  // 中央骨
  if (midCat) {
    const color = CATEGORY_COLORS[2] ?? "#3b82f6";
    const tipX = midBoneRootX - BONE_LENGTH * 0.85;
    svg += `<line x1="${midBoneRootX}" y1="${SPINE_Y}" x2="${tipX}" y2="${SPINE_Y}" stroke="${color}" stroke-width="2.5" stroke-linecap="round"/>`;
    svg += `<rect x="${tipX - 52}" y="${SPINE_Y - 12}" width="104" height="20" rx="4" fill="${color}" opacity="0.9"/>`;
    svg += `<text x="${tipX}" y="${SPINE_Y - 2}" text-anchor="middle" dominant-baseline="middle" fill="white" font-size="9" font-weight="bold" font-family="sans-serif">${escapeXml(midCat.name)}</text>`;
    midCat.causes.slice(0, 2).forEach((cause, ci) => {
      const subX = midBoneRootX - (BONE_LENGTH * 0.2 + ci * BONE_LENGTH * 0.25) * 0.85;
      const lines = wrapText(cause, 8).slice(0, 2);
      svg += `<line x1="${subX}" y1="${SPINE_Y}" x2="${subX}" y2="${SPINE_Y - 22}" stroke="${color}" stroke-width="1.5" stroke-dasharray="3,2" opacity="0.7"/>`;
      lines.forEach((l, li) => {
        svg += `<text x="${subX}" y="${SPINE_Y - 26 - li * 11}" text-anchor="middle" dominant-baseline="middle" fill="${color}" font-size="8" font-family="sans-serif">${escapeXml(l)}</text>`;
      });
    });
  }

  svg += `</svg>`;
  return svg;
}

/**
 * フィッシュボーン図をPNGバッファとして返す
 */
export async function renderFishboneToPng(data: FishboneData): Promise<Buffer> {
  const svgStr = generateFishboneSvg(data);
  return sharp(Buffer.from(svgStr))
    .png()
    .toBuffer();
}
