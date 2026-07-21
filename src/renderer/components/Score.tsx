import type { SubScores } from "../../shared/types";
import { RUBRIC_KEYS, RUBRIC_WEIGHTS } from "../../shared/types";

function scoreColor(score: number): string {
  if (score >= 75) return "#fffb97";
  if (score >= 50) return "#e0592a";
  return "#b32c1a";
}

export function ScoreRing({ score, size = 84 }: { score: number; size?: number }) {
  const stroke = 7;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(100, score)) / 100;
  const color = scoreColor(score);
  return (
    <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} stroke="#4a2f2c" strokeWidth={stroke} fill="none" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={color}
          strokeWidth={stroke}
          fill="none"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - pct)}
          strokeLinecap="round"
          style={{ transition: "stroke-dashoffset 400ms ease, stroke 400ms ease" }}
        />
      </svg>
      <div className="absolute flex flex-col items-center">
        <span className="text-2xl font-bold tabular-nums" style={{ color }}>{score}</span>
        <span className="text-[10px] text-muted -mt-0.5">/ 100</span>
      </div>
    </div>
  );
}

export function RubricChips({ subscores }: { subscores: SubScores }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {RUBRIC_KEYS.map((k) => {
        const max = RUBRIC_WEIGHTS[k];
        const v = subscores[k];
        const pct = v / max;
        const color = pct >= 0.75 ? "#fffb97" : pct >= 0.4 ? "#e0592a" : "#b32c1a";
        return (
          <span
            key={k}
            className="px-2 py-0.5 rounded-full text-[10px] font-medium capitalize border"
            style={{ color, borderColor: color + "55", background: color + "12" }}
            title={`${k}: ${v}/${max}`}
          >
            {k} {v}/{max}
          </span>
        );
      })}
    </div>
  );
}

export function ScoreLift({ before, after }: { before: number; after: number }) {
  const delta = after - before;
  if (delta <= 0) return <span className="text-muted text-xs">no lift</span>;
  return (
    <span className="text-ok text-xs font-semibold tabular-nums">+{delta} lift</span>
  );
}
