import { CATEGORIES, USERS } from './categories.js';

const templates = [
  { desc: 'Almuerzo ejecutivo',      cat: 'almuerzos',     min: 12000,   max: 18000  },
  { desc: 'Rappi',                   cat: 'restaurantes',  min: 25000,   max: 60000  },
  { desc: 'Carulla',                 cat: 'comida',        min: 30000,   max: 90000  },
  { desc: 'TransMilenio',            cat: 'transporte',    min: 2800,    max: 5600   },
  { desc: 'Uber',                    cat: 'transporte',    min: 8000,    max: 35000  },
  { desc: 'Capricho del día',        cat: 'gusticos',      min: 15000,   max: 80000  },
  { desc: 'Salida fin de semana',    cat: 'plancitos',     min: 50000,   max: 200000 },
  { desc: 'Ahorro mensual',          cat: 'ahorro',        min: 300000,  max: 500000 },
  { desc: 'Cuota préstamo',          cat: 'deuda',         min: 150000,  max: 300000 },
  { desc: 'Curso online',            cat: 'educacion',     min: 50000,   max: 200000 },
  { desc: 'Netflix',                 cat: 'suscripciones', min: 21900,   max: 21900  },
  { desc: 'Spotify',                 cat: 'suscripciones', min: 7900,    max: 7900   },
  { desc: 'Sérum facial',            cat: 'skincare',      min: 35000,   max: 120000 },
  { desc: 'Regalo cumpleaños',       cat: 'regalos',       min: 30000,   max: 150000 },
  { desc: 'Consulta médica',         cat: 'salud',         min: 40000,   max: 120000 },
  { desc: 'Arriendo',                cat: 'vivienda',      min: 900000,  max: 900000 },
  { desc: 'Seguro vehículo',         cat: 'seguros',       min: 80000,   max: 150000 },
  { desc: 'Veterinaria',             cat: 'mascotas',      min: 30000,   max: 150000 },
  { desc: 'Amazon',                  cat: 'tecnologia',    min: 40000,   max: 250000 },
  { desc: 'Servicios públicos',      cat: 'servicios',     min: 80000,   max: 200000 },
];

function rand(min, max) {
  return Math.round((min + Math.random() * (max - min)) / 100) * 100;
}

export function generateTransactions() {
  const txns = [];
  let id = 1;

  [1, 2, 3, 4, 5].forEach(month => {
    USERS.forEach(user => {
      // Salary at start of month
      txns.push({
        id: id++,
        userId: user.id,
        date: `2026-${String(month).padStart(2, '0')}-01`,
        desc: 'Salario',
        category: 'ingreso',
        amount: user.id === 'belmont' ? 4800000 : 3200000,
        type: 'income',
      });

      const count = 12 + Math.floor(Math.random() * 8);
      for (let i = 0; i < count; i++) {
        const t = templates[Math.floor(Math.random() * templates.length)];
        const day = 1 + Math.floor(Math.random() * 28);
        txns.push({
          id: id++,
          userId: user.id,
          date: `2026-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
          desc: t.desc,
          category: t.cat,
          amount: rand(t.min, t.max),
          type: t.cat === 'ahorro' || t.cat === 'ingreso' ? 'income' : 'expense',
        });
      }
    });
  });

  return txns.sort((a, b) => new Date(b.date) - new Date(a.date));
}

export function generateBudget() {
  const budget = {};
  const BASE = {
    almuerzos: 350000, restaurantes: 200000, comida: 150000,
    transporte: 120000, gusticos: 100000, plancitos: 150000,
    ahorro: 400000, deuda: 250000, educacion: 100000,
    suscripciones: 50000, skincare: 80000, regalos: 60000,
    salud: 80000, vivienda: 900000, seguros: 120000,
    mascotas: 60000, tecnologia: 80000, viajes: 100000,
    servicios: 150000, otros: 80000,
  };
  CATEGORIES.filter(c => c.id !== 'ingreso').forEach(cat => {
    budget[cat.id] = {};
    for (let m = 1; m <= 12; m++) {
      budget[cat.id][m] = BASE[cat.id] ?? 100000;
    }
  });
  return budget;
}

// Filter transactions by user and month
export function filterTxns(txns, userFilter, year, month) {
  return txns.filter(t => {
    const d = new Date(t.date + 'T12:00:00');
    if (year  != null && d.getFullYear() !== year)      return false;
    if (month != null && d.getMonth() + 1 !== month)    return false;
    if (userFilter !== 'all' && t.userId !== userFilter) return false;
    return true;
  });
}
