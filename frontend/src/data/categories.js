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
 * Normalize a category string for fuzzy matching:
 * - lowercase
 * - collapse whitespace around slashes ("a / b" → "a/b")
 * - strip combining accent marks ("médicos" → "medicos", "Galgerías" → "galgerias")
 */
function normLabel(s) {
  return String(s)
    .trim()
    .toLowerCase()
    .replace(/\s*\/\s*/g, '/')                        // "a / b" → "a/b"
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');                 // strip accents
}

/**
 * Look up a category by short ID ('almuerzos') or by the full Spanish label
 * as it appears in Google Sheets ('Salud/médicos', 'Comida/Galgerias', …).
 *
 * Matching is case-insensitive, accent-insensitive, and ignores spaces around '/'.
 * Unknown labels fall back to 'otros' style but keep the real label for display.
 */
export const getCat = (idOrLabel) => {
  if (!idOrLabel) return OTROS();
  // Fast path: exact ID match
  const byId = CATEGORIES.find(c => c.id === idOrLabel);
  if (byId) return byId;
  // Fuzzy path: normalize both sides before comparing
  const needle = normLabel(idOrLabel);
  const byLabel = CATEGORIES.find(c => normLabel(c.label) === needle);
  if (byLabel) return byLabel;
  // Fallback: preserve the real label so it still renders
  return { ...OTROS(), id: idOrLabel, label: String(idOrLabel) };
};

export const getUser = (id) => USERS.find(u => u.id === id);
