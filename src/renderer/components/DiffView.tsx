import type { DiffSegment } from "../../shared/types";

export function DiffView({ diff }: { diff: DiffSegment[] }) {
  return (
    <pre className="font-mono text-[12px] leading-relaxed whitespace-pre-wrap break-words scroll-thin overflow-auto">
      {diff.map((seg, i) => {
        if (seg.type === "context") {
          return (
            <span key={i} className="text-slate-400">
              {seg.text}
              {"\n"}
            </span>
          );
        }
        if (seg.type === "add") {
          return (
            <span key={i} className="block bg-ok/10 text-ok border-l-2 border-ok pl-2 -ml-2">
              {seg.tag && <span className="text-[10px] font-semibold text-ok mr-2 align-middle">{seg.tag}</span>}
              {seg.text || " "}
              {"\n"}
            </span>
          );
        }
        return (
          <span key={i} className="block bg-bad/10 text-bad/80 line-through pl-2 -ml-2 border-l-2 border-bad/60">
            {seg.text || " "}
            {"\n"}
          </span>
        );
      })}
    </pre>
  );
}
