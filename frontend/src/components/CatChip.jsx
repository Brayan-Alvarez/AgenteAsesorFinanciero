import { getCat } from '../data/categories.js';

export default function CatChip({ catId }) {
  const cat = getCat(catId);
  return (
    <span className="cat-chip">
      <span className="cat-dot" style={{ background: cat.color }} />
      {cat.label}
    </span>
  );
}
