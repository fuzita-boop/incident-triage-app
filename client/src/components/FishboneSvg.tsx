/**
 * FishboneSvg — SVGベースの特性要因図（フィッシュボーン図）
 *
 * レイアウト:
 *   左側: 5カテゴリーの骨（上2本・下2本・中央1本）
 *   右端: 魚の頭（effect）
 *   中央: 水平の背骨
 */

interface FishboneData {
  effect: string;
  categories: { name: string; causes: string[] }[];
}

interface FishboneSvgProps {
  data: FishboneData;
}

const CATEGORY_COLORS = [
  "#ef4444", // 人（Man）
  "#f97316", // 手順（Method）
  "#3b82f6", // 機械・設備（Machine）
  "#22c55e", // 環境（Milieu）
  "#8b5cf6", // 管理（Management）
];

// テキストを指定幅で折り返す（SVG foreignObject非対応環境向け）
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

export default function FishboneSvg({ data }: FishboneSvgProps) {
  const W = 760;
  const H = 420;
  const SPINE_Y = H / 2;
  const SPINE_START_X = 60;
  const SPINE_END_X = W - 120;
  const HEAD_X = W - 80;

  // カテゴリーを上下に配置（5カテゴリー: 上2+中1+下2）
  // 上: index 0,1  中: index 2  下: index 3,4
  const topCats = data.categories.filter((_, i) => i === 0 || i === 1);
  const midCat = data.categories[2] ?? null;
  const bottomCats = data.categories.filter((_, i) => i === 3 || i === 4);

  // 骨の付け根X座標（等間隔）
  const boneXPositions = [
    SPINE_START_X + (SPINE_END_X - SPINE_START_X) * 0.18,
    SPINE_START_X + (SPINE_END_X - SPINE_START_X) * 0.42,
    SPINE_START_X + (SPINE_END_X - SPINE_START_X) * 0.66,
    SPINE_START_X + (SPINE_END_X - SPINE_START_X) * 0.82,
  ];

  const BONE_ANGLE = 40; // 度
  const BONE_LENGTH = 110;
  const rad = (BONE_ANGLE * Math.PI) / 180;

  // 上骨の先端
  const topBones = [
    { rootX: boneXPositions[0]!, cat: topCats[0], colorIdx: 0 },
    { rootX: boneXPositions[2]!, cat: topCats[1], colorIdx: 1 },
  ];
  // 下骨の先端
  const bottomBones = [
    { rootX: boneXPositions[1]!, cat: bottomCats[0], colorIdx: 3 },
    { rootX: boneXPositions[3]!, cat: bottomCats[1], colorIdx: 4 },
  ];
  // 中央骨（真横）
  const midBoneRootX = SPINE_START_X + (SPINE_END_X - SPINE_START_X) * 0.54;

  return (
    <div className="w-full overflow-x-auto rounded-lg border border-border/60 bg-card">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        width="100%"
        style={{ minWidth: 480, display: "block" }}
        aria-label="フィッシュボーン図（特性要因図）"
      >
        {/* 背景 */}
        <rect width={W} height={H} fill="hsl(var(--card))" />

        {/* 背骨（水平線） */}
        <line
          x1={SPINE_START_X}
          y1={SPINE_Y}
          x2={SPINE_END_X}
          y2={SPINE_Y}
          stroke="#94a3b8"
          strokeWidth={3}
          strokeLinecap="round"
        />

        {/* 矢印（背骨の先端） */}
        <polygon
          points={`${SPINE_END_X},${SPINE_Y} ${SPINE_END_X - 14},${SPINE_Y - 7} ${SPINE_END_X - 14},${SPINE_Y + 7}`}
          fill="#94a3b8"
        />

        {/* 魚の頭（effect） */}
        <ellipse cx={HEAD_X} cy={SPINE_Y} rx={52} ry={36} fill="#1e293b" />
        <ellipse cx={HEAD_X} cy={SPINE_Y} rx={50} ry={34} fill="#334155" />
        {/* 目 */}
        <circle cx={HEAD_X + 18} cy={SPINE_Y - 10} r={5} fill="white" />
        <circle cx={HEAD_X + 20} cy={SPINE_Y - 10} r={3} fill="#1e293b" />
        {/* effectテキスト */}
        {wrapText(data.effect, 7).slice(0, 3).map((line, i, arr) => (
          <text
            key={i}
            x={HEAD_X}
            y={SPINE_Y + (i - (arr.length - 1) / 2) * 13}
            textAnchor="middle"
            dominantBaseline="middle"
            fill="white"
            fontSize={10}
            fontWeight="bold"
            fontFamily="sans-serif"
          >
            {line}
          </text>
        ))}

        {/* ── 上側の骨 ── */}
        {topBones.map(({ rootX, cat, colorIdx }) => {
          if (!cat) return null;
          const tipX = rootX - BONE_LENGTH * Math.cos(rad);
          const tipY = SPINE_Y - BONE_LENGTH * Math.sin(rad);
          const color = CATEGORY_COLORS[colorIdx] ?? "#6366f1";

          return (
            <g key={`top-${colorIdx}`}>
              {/* 骨本体 */}
              <line
                x1={rootX} y1={SPINE_Y}
                x2={tipX} y2={tipY}
                stroke={color} strokeWidth={2.5} strokeLinecap="round"
              />
              {/* カテゴリーラベル背景 */}
              <rect
                x={tipX - 52} y={tipY - 22}
                width={104} height={20}
                rx={4} fill={color} opacity={0.9}
              />
              <text
                x={tipX} y={tipY - 12}
                textAnchor="middle" dominantBaseline="middle"
                fill="white" fontSize={9} fontWeight="bold" fontFamily="sans-serif"
              >
                {cat.name}
              </text>
              {/* 原因テキスト（骨の横） */}
              {cat.causes.slice(0, 3).map((cause, ci) => {
                const subX = rootX - (BONE_LENGTH * 0.25 + ci * BONE_LENGTH * 0.22) * Math.cos(rad);
                const subY = SPINE_Y - (BONE_LENGTH * 0.25 + ci * BONE_LENGTH * 0.22) * Math.sin(rad);
                const lines = wrapText(cause, 8).slice(0, 2);
                return (
                  <g key={ci}>
                    {/* 小骨 */}
                    <line
                      x1={subX} y1={subY}
                      x2={subX - 18} y2={subY - 18}
                      stroke={color} strokeWidth={1.5} strokeDasharray="3,2" opacity={0.7}
                    />
                    {lines.map((l, li) => (
                      <text
                        key={li}
                        x={subX - 20} y={subY - 20 - li * 11}
                        textAnchor="end" dominantBaseline="middle"
                        fill={color} fontSize={8} fontFamily="sans-serif"
                      >
                        {l}
                      </text>
                    ))}
                  </g>
                );
              })}
            </g>
          );
        })}

        {/* ── 下側の骨 ── */}
        {bottomBones.map(({ rootX, cat, colorIdx }) => {
          if (!cat) return null;
          const tipX = rootX - BONE_LENGTH * Math.cos(rad);
          const tipY = SPINE_Y + BONE_LENGTH * Math.sin(rad);
          const color = CATEGORY_COLORS[colorIdx] ?? "#6366f1";

          return (
            <g key={`bottom-${colorIdx}`}>
              <line
                x1={rootX} y1={SPINE_Y}
                x2={tipX} y2={tipY}
                stroke={color} strokeWidth={2.5} strokeLinecap="round"
              />
              <rect
                x={tipX - 52} y={tipY + 2}
                width={104} height={20}
                rx={4} fill={color} opacity={0.9}
              />
              <text
                x={tipX} y={tipY + 12}
                textAnchor="middle" dominantBaseline="middle"
                fill="white" fontSize={9} fontWeight="bold" fontFamily="sans-serif"
              >
                {cat.name}
              </text>
              {cat.causes.slice(0, 3).map((cause, ci) => {
                const subX = rootX - (BONE_LENGTH * 0.25 + ci * BONE_LENGTH * 0.22) * Math.cos(rad);
                const subY = SPINE_Y + (BONE_LENGTH * 0.25 + ci * BONE_LENGTH * 0.22) * Math.sin(rad);
                const lines = wrapText(cause, 8).slice(0, 2);
                return (
                  <g key={ci}>
                    <line
                      x1={subX} y1={subY}
                      x2={subX - 18} y2={subY + 18}
                      stroke={color} strokeWidth={1.5} strokeDasharray="3,2" opacity={0.7}
                    />
                    {lines.map((l, li) => (
                      <text
                        key={li}
                        x={subX - 20} y={subY + 20 + li * 11}
                        textAnchor="end" dominantBaseline="middle"
                        fill={color} fontSize={8} fontFamily="sans-serif"
                      >
                        {l}
                      </text>
                    ))}
                  </g>
                );
              })}
            </g>
          );
        })}

        {/* ── 中央骨（真横・管理カテゴリー） ── */}
        {midCat && (() => {
          const color = CATEGORY_COLORS[2] ?? "#3b82f6";
          const tipX = midBoneRootX - BONE_LENGTH * 0.85;
          return (
            <g>
              <line
                x1={midBoneRootX} y1={SPINE_Y}
                x2={tipX} y2={SPINE_Y}
                stroke={color} strokeWidth={2.5} strokeLinecap="round"
              />
              <rect
                x={tipX - 52} y={SPINE_Y - 12}
                width={104} height={20}
                rx={4} fill={color} opacity={0.9}
              />
              <text
                x={tipX} y={SPINE_Y - 2}
                textAnchor="middle" dominantBaseline="middle"
                fill="white" fontSize={9} fontWeight="bold" fontFamily="sans-serif"
              >
                {midCat.name}
              </text>
              {midCat.causes.slice(0, 2).map((cause, ci) => {
                const subX = midBoneRootX - (BONE_LENGTH * 0.2 + ci * BONE_LENGTH * 0.25) * 0.85;
                const lines = wrapText(cause, 8).slice(0, 2);
                return (
                  <g key={ci}>
                    <line
                      x1={subX} y1={SPINE_Y}
                      x2={subX} y2={SPINE_Y - 22}
                      stroke={color} strokeWidth={1.5} strokeDasharray="3,2" opacity={0.7}
                    />
                    {lines.map((l, li) => (
                      <text
                        key={li}
                        x={subX} y={SPINE_Y - 26 - li * 11}
                        textAnchor="middle" dominantBaseline="middle"
                        fill={color} fontSize={8} fontFamily="sans-serif"
                      >
                        {l}
                      </text>
                    ))}
                  </g>
                );
              })}
            </g>
          );
        })()}

        {/* タイトル */}
        <text
          x={W / 2 - 40} y={18}
          textAnchor="middle" dominantBaseline="middle"
          fill="#64748b" fontSize={10} fontFamily="sans-serif"
        >
          特性要因図（フィッシュボーン図）
        </text>
      </svg>

      {/* 凡例 */}
      <div className="flex flex-wrap gap-2 px-3 pb-3 pt-1">
        {data.categories.map((cat, i) => (
          <span
            key={i}
            className="flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full text-white"
            style={{ backgroundColor: CATEGORY_COLORS[i] ?? "#6366f1" }}
          >
            {cat.name}
          </span>
        ))}
      </div>
    </div>
  );
}
