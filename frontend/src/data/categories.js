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

export const getCat  = (id) => CATEGORIES.find(c => c.id === id) ?? CATEGORIES.find(c => c.id === 'otros');
export const getUser = (id) => USERS.find(u => u.id === id);
