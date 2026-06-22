# Code Audit — AgenteAsesorFinanciero

> Auditoría completa del codebase. Revisado el 2026-06-21.
> Cada ítem incluye: archivo, severidad, problema y solución sugerida.
> Severidad: 🔴 ALTA · 🟡 MEDIA · 🟢 BAJA

---

## 1. Código muerto / Unused code

- [ ] 🔴 **Carpeta `ui/` entera sin usar** — `ui/app.py`, `ui/chat.py`, `ui/dashboard.py` son una UI Streamlit abandonada. Ningún archivo del proyecto la importa ni referencia. Ocupa espacio y confunde a cualquiera que explore el repo.
  - **Fix:** `rm -rf ui/`

- [ ] 🔴 **Estado de Sheets en AppContext nunca consumido** — `AppContext.jsx:68-72` declara `apiBudget`, `apiTrend`, `expensesCache`, `isLoadingApi`, `apiError` y los llena en el `useEffect:142-145`. **Ninguna página los consume** (grep confirmado: cero usos fuera de AppContext). Esas llamadas a `/api/budget` y `/api/trend` se hacen en cada carga de la app sin que nadie lea el resultado.
  - **Fix:** Eliminar las 5 variables de estado, el `useEffect` que llama a `getBudget()`/`getTrend()`, y el `fetchExpenses` de AppContext. Páginas que necesiten tendencia la piden directamente (Dashboard ya lo hace con `getBudgetSummary`).

- [ ] 🔴 **Funciones legacy en `frontend/src/api/client.js` sin consumidor** — `getBudget()` (línea 29), `getExpenses()` (línea 34), `getTrend()` (línea 41) y `getPersonas()` llaman a los endpoints Sheets (`/api/budget`, `/api/expenses`, `/api/trend`, `/api/personas`). Nada en las páginas las importa hoy.
  - **Fix:** Eliminar esas 4 funciones del cliente.

- [ ] 🟡 **`data/cache.py` solo sirve a rutas Sheets** — La caché TTL solo es usada por `data/data_processor.py` y `data/sheets_loader.py`, que a su vez solo son usados por `api/routes/dashboard.py` (las rutas legacy). Cuando se elimine `dashboard.py`, este módulo queda huérfano.
  - **Fix:** Eliminar junto con la limpieza de Sheets en el punto siguiente.

- [ ] 🟡 **`data/data_processor.py` duplica lógica del agente** — `simulate_purchase()` en este archivo hace lo mismo que la herramienta del mismo nombre en `agent/tools.py`. Solo es llamada desde la ruta Sheets del dashboard (que ya no se usa).
  - **Fix:** Eliminar `data/data_processor.py` al retirar las rutas Sheets. La lógica canónica vive en `agent/tools.py`.

- [ ] 🟡 **Tests stub sin implementar** — `tests/test_tools.py` tiene 11 funciones con cuerpo `pass`. Pytest los reporta como "pasando" pero no verifican nada. Igual `tests/test_processor.py` puede tener stubs similares.
  - **Fix:** Implementar tests reales o eliminar el archivo. Un test que siempre pasa es peor que no tener test.

- [ ] 🟢 **`design_handoff_finanzas/` en raíz** — Carpeta con assets de diseño. No es código funcional.
  - **Fix:** Mover a `/docs/design/` o eliminar si ya no se necesita.

---

## 2. Endpoints legacy todavía registrados en producción

- [ ] 🔴 **`api/routes/dashboard.py` completo es código muerto** — Contiene 4 endpoints Sheets-based que siguen registrados en `main.py:95` y accesibles en producción:
  - `GET /api/budget` → lee Google Sheets
  - `GET /api/expenses` → lee Google Sheets  
  - `GET /api/trend` → lee Google Sheets
  - `GET /api/transactions` → lee Google Sheets (lista plana legacy)
  - `GET /api/personas` → lee env var `PERSON_NAMES`
  
  Supabase reemplaza todo esto desde Phase 7. Dejar estos endpoints activos expone credenciales de Sheets innecesariamente en producción y mantiene dependencias de `gspread`, `google-auth`, etc.
  - **Fix:** Eliminar `api/routes/dashboard.py` y su `include_router` en `main.py:95`. Verificar que ninguna página los llame (ya comprobado en AppContext).

- [ ] 🟡 **Variables de entorno Sheets todavía requeridas en Railway** — `BUDGET_SHEET_ID`, `EXPENSES_SHEET_ID`, `GOOGLE_CREDENTIALS_JSON` siguen en Railway aunque los endpoints que las usan van a eliminarse.
  - **Fix:** Después de eliminar `dashboard.py`, remover esas vars de Railway y del `.env.example`.

---

## 3. Seguridad

- [ ] 🔴 **Sin autenticación en ningún endpoint** — Toda la API (`/api/transactions`, `/api/budget`, `/api/income`, `/api/primas`, etc.) es accesible sin token. Cualquiera que conozca la URL de Railway puede leer y escribir todos los datos financieros de la pareja.
  - **Fix:** Añadir autenticación. Opciones por orden de esfuerzo:
    1. API key simple: header `X-API-Key` validado en middleware FastAPI, llave en env var.
    2. Supabase Auth: JWT emitido por Supabase, validado en backend con `supabase.auth.get_user()`.
    3. Auth0 / Google OAuth: para UI pública completa.
  - El mínimo viable es la API key (opción 1) — 30 minutos de trabajo.

- [ ] 🔴 **Sin paginación en `/api/transactions/db`** — `db/queries.py:233` ejecuta `SELECT *` sin `LIMIT`. Con años de historial (miles de filas), una sola petición descarga toda la tabla. Riesgo de OOM en Railway y timeouts en el navegador.
  - **Fix:** Añadir params `limit: int = 200, offset: int = 0` a `get_transactions()` y a la ruta. Ajustar AppContext para cargar por página o solo el año actual.

- [ ] 🟡 **CORS demasiado permisivo en métodos y cabeceras** — `api/main.py:78-84` usa `allow_methods=["*"]` y `allow_headers=["*"]`. El origin sí está restringido, pero métodos y headers deberían ser explícitos.
  - **Fix:**
    ```python
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization", "X-API-Key"],
    ```

- [ ] 🟡 **`GOOGLE_CREDENTIALS_PATH` sin validación** — `data/sheets_loader.py` acepta una ruta de archivo de env var sin verificar que esté dentro del proyecto. Path traversal teórico.
  - **Fix:** Irrelevante si se elimina el módulo Sheets. De lo contrario, usar `pathlib.Path.resolve()` y verificar que esté bajo el directorio del proyecto.

- [ ] 🟡 **Logs exponen stack traces completos en producción** — Todos los routes usan `logger.exception(...)` que incluye el stack trace completo. En producción, esto puede exponer rutas de archivo, estructura de la BD, o valores de parámetros.
  - **Fix:** En producción (`LOG_LEVEL=WARNING`), loguear solo `logger.error(msg)` sin stack. En desarrollo, mantener `.exception()`.

- [ ] 🟢 **Fallback a `localhost:8000` en frontend** — `frontend/src/api/client.js:13`: `import.meta.env.VITE_API_URL || "http://localhost:8000"`. Si la var no está en Vercel, el frontend llama silenciosamente a localhost y falla sin mensaje claro.
  - **Fix:**
    ```js
    const BASE_URL = import.meta.env.VITE_API_URL;
    if (!BASE_URL) throw new Error("VITE_API_URL env var is not set");
    ```
    O al menos un `console.warn` visible.

---

## 4. Redundancias / Lógica duplicada

- [ ] 🔴 **Lógica de presupuesto vs actual duplicada en 3 lugares:**
  1. `api/routes/summary.py` — Supabase, para Dashboard
  2. `api/routes/dashboard.py` — Sheets (legacy, a eliminar)
  3. `agent/tools.py:get_budget_summary()` — el agente recalcula todo localmente desde Supabase en lugar de llamar a `/api/summary/budget`
  
  Cuando cambie la lógica de carry-forward o la agregación por usuario, hay que actualizarla en 3 sitios.
  - **Fix:** El agente debe llamar a `/api/summary/budget` vía HTTP en lugar de duplicar la lógica. Después de eliminar `dashboard.py`, solo queda `summary.py`.

- [ ] 🟡 **`SPANISH_MONTHS` definido en 6 archivos distintos** — `agent/tools.py`, `agent/graph.py`, `data/sheets_loader.py`, `data/data_processor.py`, `frontend/src/pages/Dashboard.jsx`, `frontend/src/pages/Transactions.jsx`, `frontend/src/pages/Budget.jsx`.
  - **Fix (Python):** Crear `utils/constants.py` con `SPANISH_MONTHS` e importar desde ahí.
  - **Fix (JS):** Ya existe en `frontend/src/pages/Dashboard.jsx` como `MONTHS_LONG`. Exportarla y reutilizarla en Transactions y Budget.

- [ ] 🟡 **`_get_categories()` en `agent/tools.py` se llama 3+ veces por sesión** — Cada herramienta del agente (`get_budget_summary`, `get_expenses`, `simulate_purchase`) llama a `_get_categories()` que ejecuta un `SELECT` a Supabase. En un turno de conversación donde el agente usa 3 herramientas, hace 3 queries idénticas.
  - **Fix:** Pasar las categorías como parte de `financial_context` en el estado del agente (ya existe `AgentState.financial_context`). Cargarlo una vez al inicio de sesión.

- [ ] 🟡 **Carry-forward duplicado en frontend** — `db/queries.py:118-164` implementa carry-forward para presupuesto (lógica Python). `frontend/src/pages/Budget.jsx` tiene lógica local para calcular totales de presupuesto que asume que los datos ya vienen correctos de la API. Riesgo de divergencia si la lógica cambia en Python.
  - **Fix:** El frontend solo debe mostrar lo que devuelve la API. Nunca calcular carry-forward localmente.

---

## 5. Calidad del backend

- [ ] 🔴 **Sin `response_model` en rutas de Subscriptions** — `api/routes/subscriptions.py` declara todos sus endpoints con `-> list` o `-> dict` en lugar de `response_model=SubscriptionOut`. FastAPI no valida la respuesta, OpenAPI docs muestran `Any`, y errores de serialización pasan silenciosamente.
  - **Fix:** Crear `SubscriptionOut` en `api/models.py` y añadir `response_model=SubscriptionOut` a cada endpoint.

- [ ] 🟡 **`except Exception` en todos los routes** — Captura también errores de programación (NameError, TypeError, AttributeError) como si fueran errores de BD, los convierte en 500 y oculta el bug real. Dificulta el debugging.
  - **Fix:** Capturar excepciones específicas del cliente Supabase (`APIError`, `PostgrestAPIError`). Dejar que errores inesperados propaguen con traceback claro (FastAPI los convierte en 500 de todas formas).

- [ ] 🟡 **N+1 en `get_debts()`** — `db/queries.py:_compute_debt_stats()` se llama una vez por deuda dentro del loop de `get_debts()`. Para 10 deudas = 10+ queries a `debt_payments`. 
  - **Fix:** Traer todos los pagos en un solo query (`SELECT * FROM debt_payments WHERE debt_id IN (...)`) y computar stats en Python.

- [ ] 🟡 **`seed_income_transactions_history()` trae toda la tabla** — `db/queries.py:1015`: `sb.table("transactions").select("date").execute()` descarga TODAS las fechas para encontrar meses distintos. Con 2000+ transacciones, payload innecesariamente grande.
  - **Fix:** Usar una query con `GROUP BY DATE_TRUNC('month', date)` directamente en PostgreSQL via `rpc()`.

- [ ] 🟡 **Race condition en `process_pending_subscriptions`** — `db/queries.py:809-816`: check-then-insert sin atomicidad. Dos llamadas simultáneas (ej. dos tabs abiertas) pueden crear transacciones duplicadas de suscripciones.
  - **Fix:** Añadir constraint único en la BD: `UNIQUE (subscription_id, DATE_TRUNC('month', date))`. El segundo insert fallará graciosamente.

- [ ] 🟢 **`installment_amount` puede ser 0 con tasa de interés** — `api/models.py:308`, `db/queries.py:646`. Si una deuda tiene `annual_rate > 0` pero `installment_amount = 0`, el cálculo de amortización divide por cero o genera resultados incorrectos.
  - **Fix:** Validar en `DebtCreate`: si `annual_rate` está presente y > 0, `installment_amount` debe ser > 0.

---

## 6. Calidad del frontend

- [ ] 🔴 **`Budget.jsx` tiene 3194 líneas** — Contiene 4 funcionalidades completamente distintas: presupuesto por categoría, deudas, suscripciones y primas. Es la página más difícil de mantener del proyecto.
  - **Fix:** Extraer cada tab a su propio componente en `frontend/src/pages/`:
    - `BudgetPresupuesto.jsx` — grid de categorías × usuarios
    - `BudgetDeudas.jsx` — cards de deudas + pagos
    - `BudgetSuscripciones.jsx` — cards de suscripciones + KPIs
    - `BudgetIngresos.jsx` — income cards + primas
    - `Budget.jsx` queda como shell con tabs + estado compartido

- [ ] 🟡 **`AppContext.jsx` mezcla demasiadas responsabilidades** — 384 líneas que cargan usuarios, categorías, transacciones, suscripciones, deudas, primas, y orquestan el auto-procesamiento de suscripciones e ingresos. Cualquier bug en una parte afecta todo lo demás y hace el archivo difícil de testear.
  - **Fix:** Separar en contextos más pequeños: `UserContext`, `TransactionContext`, `BudgetContext`. O al menos extraer el init de datos a un hook `useAppInit()`.

- [ ] 🟡 **Sin `React.memo` en componentes de lista** — `Avatar`, `UserToggle` y `CatChip` se renderizan decenas de veces en la tabla de transacciones. Cada re-render del padre (ej. hover state) los re-renderiza todos sin comparar props.
  - **Fix:** `export default React.memo(Avatar)` en Avatar.jsx, CatChip.jsx y UserToggle.jsx.

- [ ] 🟡 **Sin manejo de error en la carga inicial de AppContext** — `AppContext.jsx:85-149`: si `getUsers()` o `getCategories()` fallan, el `.catch()` en línea 128 solo loguea en consola. La app queda en estado de carga infinita (`isLoadingTxns: true`) sin mensaje al usuario.
  - **Fix:** Añadir estado `initError` y mostrar un componente de error en `App.jsx` cuando el init falla.

- [ ] 🟡 **Modal sin cierre al presionar Escape** — `frontend/src/components/Modal.jsx` no tiene listener para `keydown Escape`. UX estándar de modales.
  - **Fix:**
    ```js
    useEffect(() => {
      const onKey = (e) => { if (e.key === 'Escape') onClose(); };
      document.addEventListener('keydown', onKey);
      return () => document.removeEventListener('keydown', onKey);
    }, [onClose]);
    ```

- [ ] 🟡 **`TxnForm.jsx` no avisa al cerrar con cambios sin guardar** — Si el usuario edita una transacción y hace clic fuera del modal, los cambios se pierden silenciosamente.
  - **Fix:** Trackear estado `isDirty` (si el form difiere del `initial`). Si `isDirty && onClose`, confirmar con `confirm()` o un diálogo inline.

- [ ] 🟢 **`frontend/src/data/categories.js` es letra muerta** — Contiene la definición estática de 15 categorías con íconos y subcategorías. Desde Phase 6, las categorías vienen de Supabase. El archivo se importó en `seed.js` y quizás en otro sitio, pero las categorías "reales" son las de la BD.
  - **Fix:** Verificar si alguna página lo importa directamente. Si no, eliminar. Si sí, documentar claramente que es solo referencia / seed inicial.

- [ ] 🟢 **`frontend/src/data/seed.js` solo exporta `filterTxns`** — El resto del archivo (funciones de seed) ya no se usa. `filterTxns` se importa en Dashboard, Transactions y Budget.
  - **Fix:** Renombrar a `frontend/src/utils/filterTxns.js` y eliminar el código de seed muerto.

---

## 7. Consistencia de datos

- [ ] 🟡 **`budgetTotal` en Dashboard y `totalBudgetAllUsers` en Budget calculan diferente** — Dashboard excluye el auto-budget de deudas (`debtBudgetAllUsers`). Budget.jsx lo incluye. Ambos se muestran al usuario en distintas vistas y pueden diferir en cientos de miles de pesos.
  - **Fix:** Documentar explícitamente la diferencia (Dashboard muestra presupuesto manual + subs; Budget muestra manual + subs + deudas automáticas) o unificar en un único endpoint de API que devuelva el total definitivo.

- [ ] 🟡 **`catVsBudget` en Dashboard no incluye la fila de Suscripciones** — Después del fix de hoy, "Suscripciones" se excluye del `budgetSummary.planned` sum. Pero la fila tampoco aparece en el gráfico "Categorías vs presupuesto" porque el API no devuelve presupuesto manual para esa categoría. El usuario no puede ver el % usado de suscripciones en el Dashboard.
  - **Fix:** Añadir manualmente la fila de Suscripciones a `catVsBudget` con `planned = subsAutoTotal` y `actual` calculado desde transacciones de la categoría.

- [ ] 🟢 **`payment_day` de primas antiguas queda en 15 (default SQL)** — Las primas creadas antes del campo `payment_day` se generarán el día 15 tras la migración. El usuario puede no saberlo.
  - **Fix:** Notificar en el UI que las primas existentes usan el día 15 por defecto y que deben editarlas si quieren otro día.

---

## 8. Dependencias y configuración

- [ ] 🟡 **`gspread`, `google-auth`, `google-auth-oauthlib` son dependencias de producción innecesarias** — `requirements.txt:14-16`. Estas libs solo sirven a `data/sheets_loader.py` → `api/routes/dashboard.py` (legacy). En Railway se instalan en cada deploy aumentando tiempo de build.
  - **Fix:** Eliminar al retirar `dashboard.py` y `sheets_loader.py`.

- [ ] 🟡 **`pandas` probablemente innecesario** — `requirements.txt:19`. Fue central en Phase 1 para procesar Sheets. Con Supabase, los datos llegan como dicts Python. Buscar si algún archivo activo lo importa.
  - **Fix:** `grep -rn "import pandas" api/ agent/ db/`. Si no hay hits, eliminar.

- [ ] 🟢 **`venv_new/` en raíz del proyecto** — Carpeta de virtualenv en el repo root (no gitignoreada o sí gitignoreada pero presente localmente). Confirmar que está en `.gitignore`.
  - **Fix:** Añadir `venv_new/` a `.gitignore` si no está.

---

## 9. Deuda técnica de features incompletas

- [ ] 🟡 **Agente IA no tiene contexto de deudas ni primas** — `agent/prompts.py` y `agent/tools.py` no tienen herramienta `get_prima_summary`. Preguntar "¿cuánto llega de prima en junio?" al chat no funcionará.
  - **Fix:** Añadir `get_prima_summary(year, month)` a `agent/tools.py` que calcule primas activas para ese mes, incluyendo salary_pct vs monto fijo.

- [ ] 🟡 **`POST /api/primas/process` no se llama automáticamente en carga de app** — `AppContext` llama a `processSubscriptions()` en el `useEffect` pero no llama a `processPrimas()`. Las primas del mes solo se generan cuando el usuario va a Budget tab → `/api/primas/process`.
  - **Fix:** Añadir `processPrimas(year, currentMonth)` al `useEffect` de init de AppContext, junto a `processSubscriptions()`. Es idempotente.

- [ ] 🟢 **No hay forma de ver el historial de primas generadas** — El usuario puede ver las primas configuradas, pero no las transacciones de ingresos que se generaron de ellas (a menos que vaya a Transacciones y filtre por "Ingresos").
  - **Fix:** En la card de cada prima, añadir un toggle "Ver transacciones" que filtre por `prima_id`.

---

## Resumen de prioridades

### 🔴 Crítico — hacer ya
1. Eliminar carpeta `ui/` (código muerto)
2. Eliminar estado Sheets de AppContext (`apiBudget`, `apiTrend`, `expensesCache`)
3. Eliminar `api/routes/dashboard.py` y su `include_router`
4. Añadir autenticación básica (API key) a todos los endpoints
5. Añadir paginación a `GET /api/transactions/db`

### 🟡 Importante — próximos sprints
6. Añadir `response_model` a rutas de Subscriptions
7. Extraer tabs de Budget.jsx en componentes separados
8. Eliminar `gspread`/`google-auth` de requirements.txt
9. Unificar `SPANISH_MONTHS` en un solo archivo
10. Fix race condition en process_pending_subscriptions (constraint único BD)
11. Añadir `Escape` para cerrar modales
12. Procesar primas automáticamente en AppContext init
13. Añadir herramienta de primas al agente IA

### 🟢 Limpieza menor
14. Renombrar `seed.js` → `filterTxns.js`
15. Implementar o eliminar tests stub
16. Añadir `React.memo` a Avatar/CatChip
17. Validar `installment_amount > 0` cuando hay tasa de interés
18. Verificar si `pandas` sigue siendo necesario

---

*Generado por auditoría de código — 2026-06-21*
