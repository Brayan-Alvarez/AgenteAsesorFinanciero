// SVG donut chart — matches design prototype exactly
export default function DonutChart({ data, centerLabel, centerValue }) {
  const size = 180;
  const r = 70;
  const stroke = 18;
  const cx = size / 2;
  const cy = size / 2;
  const circumference = 2 * Math.PI * r;
  const sum = data.reduce((s, d) => s + d.value, 0) || 1;

  let offset = 0;
  const segments = data.map((d, i) => {
    const len = (d.value / sum) * circumference;
    const dasharray = `${len} ${circumference - len}`;
    const el = (
      <circle
        key={i}
        cx={cx} cy={cy} r={r}
        fill="none"
        stroke={d.color}
        strokeWidth={stroke}
        strokeDasharray={dasharray}
        strokeDashoffset={-offset}
        strokeLinecap="butt"
      />
    );
    offset += len;
    return el;
  });

  return (
    <div className="donut-wrap">
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--surface-2)" strokeWidth={stroke} />
        {segments}
      </svg>
      <div className="donut-center">
        <div>
          <div className="lbl">{centerLabel}</div>
          <div className="val mono">{centerValue}</div>
        </div>
      </div>
    </div>
  );
}
