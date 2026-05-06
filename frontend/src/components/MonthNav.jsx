import { ChevronLeft, ChevronRight } from 'lucide-react';

const MONTHS_LONG = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

export default function MonthNav({ year, month, onChange }) {
  const prev = () => {
    if (month === 1) onChange(year - 1, 12);
    else onChange(year, month - 1);
  };
  const next = () => {
    if (month === 12) onChange(year + 1, 1);
    else onChange(year, month + 1);
  };

  return (
    <div className="month-nav">
      <button onClick={prev} aria-label="Mes anterior"><ChevronLeft size={16} /></button>
      <div className="lbl">{MONTHS_LONG[month - 1]} {year}</div>
      <button onClick={next} aria-label="Mes siguiente"><ChevronRight size={16} /></button>
    </div>
  );
}
