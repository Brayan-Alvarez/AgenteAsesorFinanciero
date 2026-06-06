import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';

/**
 * CategorySelector — Single grouped dropdown for categories + subcategories.
 *
 * Shows categories as bold rows and their subcategories indented below.
 * Selecting a category clears the subcategory. Selecting a subcategory
 * also sets the parent category automatically.
 *
 * Props:
 *   categories   — active categories array from AppContext (with subcategories nested)
 *   categoryId   — current selected category UUID (or '')
 *   subcategoryId — current selected subcategory UUID (or null)
 *   onChange     — (categoryId, subcategoryId) => void
 */
export default function CategorySelector({ categories, categoryId, subcategoryId, onChange }) {
  const [open,   setOpen]   = useState(false);
  const [search, setSearch] = useState('');
  const ref      = useRef();
  const searchRef = useRef();

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (!ref.current?.contains(e.target)) { setOpen(false); setSearch(''); }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  // Focus search input when opened
  useEffect(() => {
    if (open) setTimeout(() => searchRef.current?.focus(), 50);
  }, [open]);

  // Build flat item list: category rows interleaved with their subcategory rows
  const allItems = useMemo(() => {
    const items = [];
    for (const cat of categories) {
      items.push({ kind: 'cat', id: cat.id, name: cat.name, icon: cat.icon, color: cat.color });
      for (const sub of (cat.subcategories || []).filter(s => s.is_active !== false)) {
        items.push({
          kind: 'sub', id: sub.id, name: sub.name, icon: sub.icon || '',
          catId: cat.id, catIcon: cat.icon,
        });
      }
    }
    return items;
  }, [categories]);

  // Filter by search: categories that match + subcategories that match (with their parent header)
  const filtered = useMemo(() => {
    if (!search.trim()) return allItems;
    const q = search.toLowerCase().trim();
    const result = [];
    const addedCatIds = new Set();

    for (const item of allItems) {
      if (item.kind === 'cat') {
        if (item.name.toLowerCase().includes(q)) {
          result.push(item);
          addedCatIds.add(item.id);
        }
      } else {
        if (item.name.toLowerCase().includes(q)) {
          // Ensure parent category is shown above the subcategory
          if (!addedCatIds.has(item.catId)) {
            const parent = allItems.find(r => r.kind === 'cat' && r.id === item.catId);
            if (parent) { result.push(parent); addedCatIds.add(item.catId); }
          }
          result.push(item);
        }
      }
    }
    return result;
  }, [allItems, search]);

  // Compute display label
  const selectedCat = categories.find(c => c.id === categoryId);
  const selectedSub = subcategoryId
    ? (selectedCat?.subcategories || []).find(s => s.id === subcategoryId)
    : null;

  const displayLabel = selectedCat
    ? selectedSub
      ? `${selectedCat.icon} ${selectedCat.name} › ${selectedSub.name}`
      : `${selectedCat.icon} ${selectedCat.name}`
    : 'Seleccionar categoría...';

  const handleSelect = (catId, subId) => {
    onChange(catId, subId ?? null);
    setOpen(false);
    setSearch('');
  };

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      {/* Trigger button */}
      <button
        type="button"
        className="select"
        onClick={() => setOpen(o => !o)}
        style={{ width: '100%', textAlign: 'left', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}
      >
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {displayLabel}
        </span>
        <ChevronDown size={14} style={{ color: 'var(--text-mute)', flexShrink: 0 }} />
      </button>

      {/* Dropdown */}
      {open && (
        <div style={{
          position: 'absolute', zIndex: 300, top: 'calc(100% + 4px)', left: 0, right: 0,
          background: 'var(--surface)', border: '1px solid var(--border)',
          borderRadius: 10, boxShadow: '0 8px 32px rgba(0,0,0,0.35)',
          display: 'flex', flexDirection: 'column', maxHeight: 480,
        }}>
          {/* Search */}
          <div style={{ padding: '8px 8px 6px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
            <input
              ref={searchRef}
              className="input"
              style={{ padding: '6px 10px', fontSize: 13, width: '100%' }}
              placeholder="Buscar categoría o subcategoría..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              onClick={e => e.stopPropagation()}
            />
          </div>

          {/* List */}
          <div style={{ overflowY: 'auto', flex: 1 }}>
            {filtered.length === 0 && (
              <div style={{ padding: 16, fontSize: 13, color: 'var(--text-mute)', textAlign: 'center' }}>
                Sin resultados
              </div>
            )}

            {filtered.map(item => {
              if (item.kind === 'cat') {
                const isSelected = item.id === categoryId && !subcategoryId;
                return (
                  <button
                    key={`cat-${item.id}`}
                    type="button"
                    onClick={() => handleSelect(item.id, null)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 9,
                      padding: '9px 12px', width: '100%', border: 'none', cursor: 'pointer',
                      background: isSelected ? 'var(--surface-2)' : 'transparent',
                      color: 'var(--text)', fontWeight: 500, fontSize: 14,
                      textAlign: 'left',
                    }}
                  >
                    <span style={{ fontSize: 17, lineHeight: 1, flexShrink: 0 }}>{item.icon}</span>
                    <span style={{ flex: 1 }}>{item.name}</span>
                    {isSelected && <Check size={13} style={{ color: 'var(--primary)', flexShrink: 0 }} />}
                  </button>
                );
              }

              // Subcategory row
              const isSelected = item.id === subcategoryId;
              return (
                <button
                  key={`sub-${item.id}`}
                  type="button"
                  onClick={() => handleSelect(item.catId, item.id)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    padding: '7px 12px 7px 38px', width: '100%', border: 'none', cursor: 'pointer',
                    background: isSelected ? 'var(--surface-2)' : 'transparent',
                    color: isSelected ? 'var(--text)' : 'var(--text-dim)',
                    fontSize: 13, textAlign: 'left',
                  }}
                >
                  {/* Indentation connector dot */}
                  <span style={{
                    width: 5, height: 5, borderRadius: '50%',
                    background: 'var(--border)', flexShrink: 0,
                  }} />
                  {item.icon && (
                    <span style={{ fontSize: 14, lineHeight: 1, flexShrink: 0 }}>{item.icon}</span>
                  )}
                  <span style={{ flex: 1 }}>{item.name}</span>
                  {isSelected && <Check size={12} style={{ color: 'var(--primary)', flexShrink: 0 }} />}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
