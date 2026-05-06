// ─── Seed Data ───────────────────────────────────────────────────────────────

const CATEGORIES = [
  { id: 'almuerzos', label: 'Almuerzos normales', icon: '🍱', color: '#f97316' },
  { id: 'restaurantes', label: 'Restaurantes', icon: '🍽️', color: '#ef4444' },
  { id: 'comida', label: 'Comida / Galgerías', icon: '🧁', color: '#ec4899' },
  { id: 'transporte', label: 'Transporte', icon: '🚌', color: '#3b82f6' },
  { id: 'gusticos', label: 'Gusticos', icon: '🛍️', color: '#a855f7' },
  { id: 'plancitos', label: 'Plancitos', icon: '🎉', color: '#8b5cf6' },
  { id: 'ahorro', label: 'Ahorro', icon: '💰', color: '#22c55e' },
  { id: 'deuda', label: 'Deuda', icon: '📋', color: '#dc2626' },
  { id: 'educacion', label: 'Educación', icon: '📚', color: '#0ea5e9' },
  { id: 'suscripciones', label: 'Suscripciones y Ocio', icon: '📱', color: '#6366f1' },
  { id: 'skincare', label: 'SkinCare', icon: '✨', color: '#f43f5e' },
  { id: 'regalos', label: 'Regalos', icon: '🎁', color: '#d946ef' },
  { id: 'salud', label: 'Salud / Médicos', icon: '🏥', color: '#14b8a6' },
  { id: 'vivienda', label: 'Vivienda', icon: '🏠', color: '#f59e0b' },
  { id: 'seguros', label: 'Seguros', icon: '🛡️', color: '#64748b' },
  { id: 'mascotas', label: 'Mascotas', icon: '🐾', color: '#84cc16' },
  { id: 'tecnologia', label: 'Tecnología', icon: '💻', color: '#06b6d4' },
  { id: 'viajes', label: 'Viajes', icon: '✈️', color: '#f97316' },
  { id: 'servicios', label: 'Servicios básicos', icon: '💡', color: '#eab308' },
  { id: 'otros', label: 'Otros', icon: '📦', color: '#94a3b8' },
  { id: 'ingreso', label: 'Ingreso', icon: '💵', color: '#10b981' },
];

const USERS = [
  { id: 'belmont', name: 'Belmont', avatar: 'B', color: '#6366f1' },
  { id: 'sofi', name: 'Sofi', avatar: 'S', color: '#ec4899' },
];

// Generate seed transactions
function generateTransactions() {
  const txns = [];
  let id = 1;

  const templates = [
    { desc: 'Almuerzo ejecutivo', cat: 'almuerzos', min: 12000, max: 18000 },
    { desc: 'Rappi', cat: 'restaurantes', min: 25000, max: 60000 },
    { desc: 'Carulla', cat: 'comida', min: 30000, max: 90000 },
    { desc: 'TransMilenio', cat: 'transporte', min: 2800, max: 5600 },
    { desc: 'Uber', cat: 'transporte', min: 8000, max: 35000 },
    { desc: 'Capricho del día', cat: 'gusticos', min: 15000, max: 80000 },
    { desc: 'Salida fin de semana', cat: 'plancitos', min: 50000, max: 200000 },
    { desc: 'Ahorro mensual', cat: 'ahorro', min: 300000, max: 500000 },
    { desc: 'Cuota préstamo', cat: 'deuda', min: 150000, max: 300000 },
    { desc: 'Curso online', cat: 'educacion', min: 50000, max: 200000 },
    { desc: 'Netflix', cat: 'suscripciones', min: 21900, max: 21900 },
    { desc: 'Spotify', cat: 'suscripciones', min: 7900, max: 7900 },
    { desc: 'Sérum facial', cat: 'skincare', min: 35000, max: 120000 },
    { desc: 'Regalo cumpleaños', cat: 'regalos', min: 30000, max: 150000 },
    { desc: 'Consulta médica', cat: 'salud', min: 40000, max: 120000 },
    { desc: 'Arriendo', cat: 'vivienda', min: 900000, max: 900000 },
    { desc: 'Seguro vehículo', cat: 'seguros', min: 80000, max: 150000 },
    { desc: 'Veterinaria', cat: 'mascotas', min: 30000, max: 150000 },
    { desc: 'Amazon', cat: 'tecnologia', min: 40000, max: 250000 },
    { desc: 'Servicios públicos', cat: 'servicios', min: 80000, max: 200000 },
    { desc: 'Salario', cat: 'ingreso', min: 3500000, max: 5000000 },
  ];

  const months = [1, 2, 3, 4, 5];

  months.forEach(month => {
    USERS.forEach(user => {
      // Salary at start of month
      txns.push({
        id: id++,
        userId: user.id,
        date: `2026-${String(month).padStart(2,'0')}-01`,
        desc: 'Salario',
        category: 'ingreso',
        amount: user.id === 'belmont' ? 4800000 : 3200000,
        type: 'income',
      });

      // Random expenses
      const count = 12 + Math.floor(Math.random() * 8);
      for (let i = 0; i < count; i++) {
        const t = templates[Math.floor(Math.random() * (templates.length - 1))]; // skip ingreso
        const day = 1 + Math.floor(Math.random() * 28);
        const amount = Math.round((t.min + Math.random() * (t.max - t.min)) / 100) * 100;
        txns.push({
          id: id++,
          userId: user.id,
          date: `2026-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`,
          desc: t.desc,
          category: t.cat,
          amount,
          type: t.cat === 'ahorro' || t.cat === 'ingreso' ? 'income' : 'expense',
        });
      }
    });
  });

  return txns.sort((a, b) => new Date(b.date) - new Date(a.date));
}

// Annual budget seed (by category per month)
function generateBudget() {
  const budget = {};
  const expenseCats = CATEGORIES.filter(c => c.id !== 'ingreso');
  expenseCats.forEach(cat => {
    budget[cat.id] = {};
    for (let m = 1; m <= 12; m++) {
      const base = {
        almuerzos: 350000, restaurantes: 200000, comida: 150000,
        transporte: 120000, gusticos: 100000, plancitos: 150000,
        ahorro: 400000, deuda: 250000, educacion: 100000,
        suscripciones: 50000, skincare: 80000, regalos: 60000,
        salud: 80000, vivienda: 900000, seguros: 120000,
        mascotas: 60000, tecnologia: 80000, viajes: 100000,
        servicios: 150000, otros: 80000,
      }[cat.id] || 100000;
      budget[cat.id][m] = base;
    }
  });
  return budget;
}

window.APP_DATA = {
  CATEGORIES,
  USERS,
  transactions: generateTransactions(),
  budget: generateBudget(),
};
