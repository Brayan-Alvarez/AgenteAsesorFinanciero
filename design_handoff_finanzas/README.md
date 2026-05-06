# Handoff: App de Finanzas Personales — Belmont & Sofi

## Overview
Aplicación web de finanzas personales multi-usuario para una pareja (Belmont y Sofi). Permite registrar transacciones (gastos e ingresos), visualizar insights mensuales con recomendaciones generadas por IA, gestionar un presupuesto anual editable por categoría y mes, y ver/filtrar todas las transacciones. Soporta visualización individual por usuario y vista conjunta.

Moneda: COP (Pesos colombianos). Idioma: Español. Tema: dark mode.

## About the Design Files
Los archivos en este bundle son **referencias de diseño creadas en HTML** — prototipos que muestran la apariencia y el comportamiento intencionado, no código de producción para copiar directamente.

La tarea es **recrear estos diseños HTML en el entorno existente de tu codebase** (React, Vue, SwiftUI, Next.js, etc.) usando sus patrones, librerías y design system establecidos. Si no hay un entorno aún, elige el framework más apropiado e implementa los diseños allí.

Los archivos `.jsx` usan React 18 con Babel standalone (sin bundler) y JSX inline — están pensados como referencia visual y de lógica, no como producción.

## Fidelity
**Alta fidelidad (hifi).** Los mockups incluyen:
- Colores finales (paleta índigo/violeta sobre dark mode)
- Tipografía final (DM Sans + DM Mono)
- Espaciado, radios y sombras finales
- Interacciones completas (modales, navegación, edición inline de presupuesto, búsqueda y filtros)
- Datos de ejemplo realistas

El desarrollador debería recrear el UI pixel-perfect usando las librerías existentes (Tailwind, shadcn/ui, Chakra, etc.).

## Screens / Views

### 1. Dashboard (Inicio)
**Propósito:** Resumen del mes actual con KPIs, presupuesto, gráficas y recomendaciones IA.

**Layout (desktop):**
- Sidebar fijo izquierdo (240px)
- Contenido principal con `max-width: 1400px`, padding `28px 36px`
- Topbar: título + sub + controles (selector de mes, toggle de usuario, botón "Nueva")
- Grid de 4 KPIs (gap 18px)
- Card de "Gastos vs presupuesto general" con barra de progreso
- Grid 12-col: gráfica donut (col-8) + recomendaciones IA (col-4)
- Grid 12-col: tendencia 6 meses (col-6) + categorías vs presupuesto (col-6)
- Tabla de últimas transacciones

**KPIs (4 cards):**
1. Ingresos (verde) — total + número de transacciones
2. Gastos — total + pill con delta vs mes anterior
3. Balance (verde si positivo, rojo si negativo)
4. Ahorro (acento violeta) + porcentaje sobre ingresos

### 2. Transacciones
**Propósito:** Lista completa filtrable de todas las transacciones del mes.

**Layout:**
- Topbar: título + count + selector de mes + toggle usuario + botón "Nueva"
- 3 KPIs (ingresos, gastos, balance del mes filtrado)
- Filtros: campo de búsqueda + select de categoría
- Lista agrupada por día con encabezado de día (día de la semana, fecha, total del día)
- Cada fila: ícono cuadrado de categoría (34×34, color de fondo `cat.color + '22'`), descripción + nombre de categoría, avatar+nombre de usuario, monto alineado a la derecha
- Click en fila → abre modal de edición

### 3. Presupuesto
**Propósito:** Diligenciar/editar/ver presupuesto anual.

**Dos vistas (toggle segmentado):**

**A. Por categoría:** Grilla 200px + 12 × `minmax(70px, 1fr)` + 100px
- Filas: cada categoría con dot de color y nombre (sticky left)
- Columnas: Ene...Dic + Total
- Cada celda numérica es un input editable (transparente al reposo, border al hover, primary al focus)
- Fila final: totales por mes + total anual (color acento)

**B. Por mes:** Grid 3 columnas con 12 cards (uno por mes)
- Cada card: nombre del mes + pill con % usado, gasto actual / presupuestado, barra de progreso, restante

### 4. IA Insights (Recomendaciones)
**Propósito:** Análisis profundo con todas las recomendaciones generadas.

**Layout:**
- Topbar con ícono Sparkle
- 3 KPIs: estado del mes (gradiente sutil), tasa de ahorro, count de recomendaciones
- Lista vertical de cards de recomendación. Cada card: ícono 44×44 con tinte del tipo, título + body, botón de acción

**Tipos de recomendación:**
- `warn` (amber/red) — Alertas de sobregasto, comparaciones negativas
- `tip` (violet) — Sugerencias de ahorro, revisar suscripciones
- `up` (green) — Felicitaciones por mejoras
- `proj` (indigo) — Proyecciones del cierre del mes

### 5. Modal "Nueva/Editar transacción"
- Campos: Usuario (toggle de 2 botones con borde de color), Tipo (Gasto/Ingreso), Descripción (texto, autoFocus), Fecha (date), Monto (number, mono), Categoría (select con emoji)
- Footer: Eliminar (rojo, solo en edit) | Cancelar + Guardar/Crear

### 6. Mobile (< 880px)
- Sidebar oculto, bottom nav fijo
- 5 botones: Inicio, Movs, FAB +, Presup., IA
- FAB circular 48×48 con gradiente índigo, sobresale -16px

## Interactions & Behavior

- **Toggle usuario** en topbar de todas las páginas: `Conjunto` | `Belmont` | `Sofi`. Filtra transacciones, KPIs y multiplica presupuestos por 2 si es "Conjunto".
- **Selector de mes** con flechas izq/der; rota año en bordes.
- **Click en transacción** (dashboard recientes o lista) → abre modal en modo edición.
- **Botón "Nueva"** → abre modal en modo creación.
- **Edición de presupuesto** inline: input numérico se vuelve editable on hover, focus border primary.
- **Búsqueda** en transacciones: case-insensitive sobre `desc`.
- **Filtro de categoría** en transacciones: select con todas las categorías + "Todas".
- **Delta vs mes anterior:** pill verde si bajó, rojo si subió. Calculado como `(actual - prev) / prev * 100`.
- **Proyección IA:** `(gastoActual / díaActual) * díasDelMes`.
- **Al guardar** una transacción nueva: id auto-incrementado, lista re-ordenada por fecha desc.

## State Management

```ts
type Transaction = {
  id: number;
  userId: 'belmont' | 'sofi';
  date: string;          // 'YYYY-MM-DD'
  desc: string;
  category: string;      // category id
  amount: number;        // positive integer (COP)
  type: 'income' | 'expense';
};

type Budget = {
  [categoryId: string]: {
    [month: number /*1-12*/]: number;
  };
};

type AppState = {
  page: 'dashboard' | 'transactions' | 'budget' | 'recommendations';
  userFilter: 'all' | 'belmont' | 'sofi';
  transactions: Transaction[];
  budget: Budget;
};
```

**Acciones:**
- `addTransaction(txn)` — añade y re-ordena
- `updateTransaction(id, txn)` — reemplaza por id
- `deleteTransaction(id)`
- `updateBudget(categoryId, month, value)` — granular por celda
- `setUserFilter(filter)`
- `setPage(page)`

**Persistencia:** En el prototipo todo está en memoria. En producción usar Supabase / Firebase / API REST + auth para los dos usuarios.

## Design Tokens

### Colores (CSS custom properties)
```css
--bg: #0b0b14;            /* Fondo de página */
--bg-2: #11111d;          /* Sidebar, headers de sección */
--surface: #161628;       /* Cards */
--surface-2: #1d1d33;     /* Cards anidadas, hovers */
--border: #26263f;        /* Bordes default */
--border-2: #33334e;      /* Bordes hover */
--text: #ecedf5;          /* Texto principal */
--text-dim: #9596b5;      /* Texto secundario */
--text-mute: #6b6c8c;     /* Labels, captions */
--primary: #818cf8;       /* Indigo claro (acento principal) */
--primary-2: #6366f1;     /* Indigo (botones primarios) */
--primary-soft: rgba(129, 140, 248, 0.12);
--accent: #a78bfa;        /* Violeta (ahorro, acentos) */
--pink: #f472b6;
--green: #34d399;         /* Ingresos, positivo */
--red: #fb7185;           /* Gastos excesivos, negativo */
--amber: #fbbf24;         /* Advertencia */
```

### Spacing
- Card padding: 22px
- Grid gaps: 18px (sections), 12-14px (within cards)
- Page padding: 28px 36px (desktop), 18px 16px (mobile)
- Border radius: `--radius: 14px` (cards), `--radius-lg: 20px` (cards grandes), 10px (buttons/inputs), 99px (pills)

### Typography
- Font sans: `'DM Sans'`, system-ui fallback
- Font mono: `'DM Mono'`, ui-monospace fallback (siempre con `font-variant-numeric: tabular-nums` para números)
- Page title: 26px / 600 / -0.02em
- Section title (uppercase): 13px / 500 / 0.06em letter-spacing
- KPI value: 30px / 600 / -0.025em
- Body: 14px / 400
- Caption: 12px / 500 / text-dim

### Shadows
- Botón primary: `0 1px 0 rgba(255,255,255,0.18) inset, 0 6px 20px -10px rgba(99,102,241,0.6)`
- Modal overlay backdrop: `rgba(5,5,12,0.7)` + `backdrop-filter: blur(6px)`

## Categories (20 categorías + "ingreso")
Definidas en `data.js`. Cada una con `id`, `label`, `icon` (emoji), `color`. Lista:

Almuerzos normales 🍱, Restaurantes 🍽️, Comida/Galgerías 🧁, Transporte 🚌, Gusticos 🛍️, Plancitos 🎉, Ahorro 💰, Deuda 📋, Educación 📚, Suscripciones y Ocio 📱, SkinCare ✨, Regalos 🎁, Salud/Médicos 🏥, Vivienda 🏠, Seguros 🛡️, Mascotas 🐾, Tecnología 💻, Viajes ✈️, Servicios básicos 💡, Otros 📦, Ingreso 💵.

## Assets
- **Iconos:** SVG inline estilo Lucide (stroke 1.8) — ver `icons.jsx`. Sustituir por `lucide-react` o equivalente del codebase.
- **Fuentes:** DM Sans + DM Mono desde Google Fonts (`@import` o `<link>`).
- **Avatares de usuario:** iniciales (B, S) sobre círculo de color (Belmont `#6366f1`, Sofi `#ec4899`).
- **Logo de marca:** cuadrado 32×32 con gradiente `linear-gradient(135deg, #818cf8 0%, #a78bfa 60%, #f472b6 100%)` y "$" centrado.

## Multi-usuario
- 2 usuarios fijos en el prototipo. En producción: tabla `users`, sesión compartida por hogar/grupo.
- Recomendado: cada transacción referencia un `user_id`. La vista "Conjunto" hace `WHERE household_id = ?` sin filtrar por usuario.
- Presupuesto: en el prototipo es compartido y se multiplica × 2 para vista conjunta. En producción decide si quieres presupuesto por usuario o por hogar.

## AI Recommendations
En el prototipo las recomendaciones son **reglas determinísticas** sobre los datos:
1. Sobregasto por categoría (`spent > budget`)
2. Proyección lineal del cierre de mes
3. Mayor categoría → sugerencia de recorte de 15-20%
4. Comparación con mes anterior
5. Tasa de ahorro vs meta de 20%
6. Suscripciones acumuladas

Para producción con LLM real: enviar el resumen mensual (totales por categoría, deltas, presupuesto) a Claude/GPT con un prompt de financial coach en español. El prototipo muestra qué información debe rendirse y en qué tono.

## Files
Archivos en este bundle:
- `Finanzas.html` — entry point con todo el CSS y los `<script>` tags
- `data.js` — categorías, usuarios, generadores de transacciones y presupuesto seed
- `icons.jsx` — set de iconos SVG inline
- `components.jsx` — Avatar, UserToggle, MonthNav, CatChip, Modal, TxnForm, Donut, BarChart, helpers (`fmt`, `monthName`, etc.)
- `pages.jsx` — Dashboard, TransactionsPage, BudgetPage, RecommendationsPage
- `app.jsx` — shell con sidebar, bottom nav, routing simple por estado
- `tweaks-panel.jsx` — panel de tweaks (no portar a producción, es solo para el prototipo)

## Notas para implementación
- Reemplaza el routing por estado con tu router (Next.js, React Router, etc.).
- Reemplaza el state global con tu solución (Zustand, Redux, Context, server state con TanStack Query).
- Las gráficas son SVG hechos a mano (Donut + BarChart). En producción usa **Recharts**, **visx** o **Chart.js** con los colores del design system.
- El formulario actualmente no valida; en producción agrega validación (zod, react-hook-form).
- Las fechas se manejan como strings `YYYY-MM-DD`. Considera **date-fns** o **Day.js** con locale `es`.
- Format de moneda: `Math.round(n).toLocaleString('es-CO')` con prefijo `$`. Para producción considera `Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 })`.
