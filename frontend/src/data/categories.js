export const CATEGORIES = [
  { id: 'almuerzos',     label: 'Almuerzos normales',  icon: '🍱', color: '#f97316' },
  { id: 'restaurantes',  label: 'Restaurantes',         icon: '🍽️', color: '#ef4444' },
  { id: 'comida',        label: 'Comida / Galgerías',   icon: '🧁', color: '#ec4899' },
  { id: 'transporte',    label: 'Transporte',           icon: '🚌', color: '#3b82f6' },
  { id: 'gusticos',      label: 'Gusticos',             icon: '🛍️', color: '#a855f7' },
  { id: 'plancitos',     label: 'Plancitos',            icon: '🎉', color: '#8b5cf6' },
  { id: 'ahorro',        label: 'Ahorro',               icon: '💰', color: '#22c55e' },
  { id: 'deuda',         label: 'Deuda',                icon: '📋', color: '#dc2626' },
  { id: 'educacion',     label: 'Educación',            icon: '📚', color: '#0ea5e9' },
  { id: 'suscripciones', label: 'Suscripciones y Ocio', icon: '📱', color: '#6366f1' },
  { id: 'skincare',      label: 'SkinCare',             icon: '✨', color: '#f43f5e' },
  { id: 'regalos',       label: 'Regalos',              icon: '🎁', color: '#d946ef' },
  { id: 'salud',         label: 'Salud / Médicos',      icon: '🏥', color: '#14b8a6' },
  { id: 'vivienda',      label: 'Vivienda',             icon: '🏠', color: '#f59e0b' },
  { id: 'seguros',       label: 'Seguros',              icon: '🛡️', color: '#64748b' },
  { id: 'mascotas',      label: 'Mascotas',             icon: '🐾', color: '#84cc16' },
  { id: 'tecnologia',    label: 'Tecnología',           icon: '💻', color: '#06b6d4' },
  { id: 'viajes',        label: 'Viajes',               icon: '✈️', color: '#f97316' },
  { id: 'servicios',     label: 'Servicios básicos',    icon: '💡', color: '#eab308' },
  { id: 'otros',         label: 'Otros',                icon: '📦', color: '#94a3b8' },
  { id: 'ingreso',       label: 'Ingreso',              icon: '💵', color: '#10b981' },
];

export const USERS = [
  { id: 'belmont', name: 'Belmont', avatar: 'B', color: '#6366f1' },
  { id: 'sofi',    name: 'Sofi',    avatar: 'S', color: '#ec4899' },
];

const OTROS = () => CATEGORIES.find(c => c.id === 'otros');

/**
 * Look up a category by its short ID (e.g. 'almuerzos') or by the full Spanish
 * label as it appears in the Google Sheet (e.g. 'Almuerzos normales').
 *
 * The ID path is the fast path for seed/hardcoded usage.
 * The label path handles real sheet data where the exact label string is returned.
 * Unknown labels fall back to the 'otros' category but preserve the original label
 * so it still displays correctly in the UI.
 */
export const getCat = (idOrLabel) => {
  if (!idOrLabel) return OTROS();
  // Fast path: exact ID match (used by existing hardcoded references)
  const byId = CATEGORIES.find(c => c.id === idOrLabel);
  if (byId) return byId;
  // Slow path: case-insensitive label match for real sheet category names
  const normalized = String(idOrLabel).trim().toLowerCase();
  const byLabel = CATEGORIES.find(c => c.label.toLowerCase() === normalized);
  if (byLabel) return byLabel;
  // Fallback: unknown category — use 'otros' style but keep the real label
  return { ...OTROS(), id: idOrLabel, label: String(idOrLabel) };
};

export const getUser = (id) => USERS.find(u => u.id === id);
