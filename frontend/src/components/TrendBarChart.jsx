// Stacked bar chart for 6-month trend — matches design prototype
export function fmt(n, compact = false) {
  if (n == null || isNaN(n)) return '$0';
  const abs = Math.abs(n);
  if (compact && abs >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (compact && abs >= 1_000)     return `$${Math.round(n / 1_000)}k`;
  return '$' + Math.round(n).toLocaleString('es-CO');
}

export default function TrendBarChart({ data, max }) {
  return (
    <div className="barchart">
      {data.map((d, i) => (
        <div key={i} className="bcol">
          <div className="b-stack">
            {d.segments.map((s, j) => (
              <div
                key={j}
                className="b-seg"
                style={{
                  flexBasis: `${(s.value / (max || 1)) * 100}%`,
                  background: s.color,
                }}
                title={`${s.label}: ${fmt(s.value, true)}`}
              />
            ))}
          </div>
          <div className="blbl">{d.label}</div>
        </div>
      ))}
    </div>
  );
}
