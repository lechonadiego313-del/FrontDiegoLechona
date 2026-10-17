import { Children, useCallback, useEffect, useState } from "react";

const MASTER_NAMES = {
  productos: "Productos",
  areas: "Áreas",
  puntos: "Puntos de muestreo",
  proveedores: "Proveedores",
  clientes: "Clientes",
  equipos: "Equipos / cámaras",
};
const FIELD_TYPES = {
  num: "Número",
  txt: "Texto",
  date: "Fecha",
  sel: "Lista de opciones",
  chk: "Sí / No",
  producto: "Producto",
  area: "Área",
  punto: "Punto de muestreo",
  proveedor: "Proveedor",
  cliente: "Cliente",
  equipo: "Equipo",
  lote: "Lote",
};
const TODAY = new Date().toISOString().slice(0, 10);
const DEFAULT_MONTH = TODAY.slice(0, 7);
const newField = () => ({ n: "", t: "txt", u: "", min: "", max: "" });
const API_BASE_URL = (
  import.meta.env.VITE_API_URL ||
  (import.meta.env.DEV ? "" : "https://backdiegolechona-1.onrender.com")
).replace(/\/+$/, "");

let pendingRequests = 0;
let pendingWrites = 0;

async function monitoredFetch(url, options) {
  const isWrite = (options?.method || "GET").toUpperCase() !== "GET";
  pendingRequests += 1;
  if (isWrite) pendingWrites += 1;
  window.dispatchEvent(new CustomEvent("lechona:request-state", {
    detail: { pending: pendingRequests, writes: pendingWrites },
  }));
  try {
    return await fetch(url, options);
  } finally {
    pendingRequests -= 1;
    if (isWrite) pendingWrites -= 1;
    window.dispatchEvent(new CustomEvent("lechona:request-state", {
      detail: { pending: pendingRequests, writes: pendingWrites },
    }));
  }
}

async function api(path, options = {}) {
  const token = sessionStorage.getItem("lechona_access_token");
  const response = await monitoredFetch(`${API_BASE_URL}/api${path}`, {
    ...options,
    headers: {
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(token && path !== "/auth/login" ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    if (response.status === 401 && path !== "/auth/login") {
      sessionStorage.removeItem("lechona_access_token");
      window.dispatchEvent(new Event("lechona:auth-expired"));
    }
    throw new Error(body.error || `La API respondió ${response.status}.`);
  }
  return response.status === 204 ? null : response.json();
}

function saveFile(name, content, type = "text/plain;charset=utf-8") {
  const link = document.createElement("a");
  link.href = URL.createObjectURL(new Blob([content], { type }));
  link.download = name;
  link.click();
  URL.revokeObjectURL(link.href);
}

function csvCell(value) {
  return `"${String(value ?? "").replaceAll('"', '""')}"`;
}

function Table({ headers, children }) {
  const [page, setPage] = useState(0);
  const rows = Children.toArray(children);
  const pageSize = 10;
  const pageCount = Math.ceil(rows.length / pageSize);
  const currentPage = Math.min(page, Math.max(0, pageCount - 1));

  useEffect(() => setPage(0), [children]);

  return (
    <>
      <div className="table-wrap">
        <table>
          <thead><tr>{headers.map((header) => <th key={header}>{header}</th>)}</tr></thead>
          <tbody>{rows.slice(currentPage * pageSize, (currentPage + 1) * pageSize)}</tbody>
        </table>
      </div>
      {pageCount > 1 && <nav className="pagination" aria-label="Paginación de tabla">
        <span>Mostrando {currentPage * pageSize + 1}–{Math.min((currentPage + 1) * pageSize, rows.length)} de {rows.length}</span>
        <div>
          <button type="button" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}>Anterior</button>
          <span>Página {currentPage + 1} de {pageCount}</span>
          <button type="button" disabled={currentPage >= pageCount - 1} onClick={() => setPage(currentPage + 1)}>Siguiente</button>
        </div>
      </nav>}
    </>
  );
}

function TrendChart({ rows, field }) {
  if (!rows.length) return <Empty>No hay lecturas numéricas este mes.</Empty>;
  const width = 720;
  const height = 220;
  const values = rows.map((row) => row.value);
  const minValue = Math.min(...values, field.min === "" || field.min == null ? Infinity : Number(field.min));
  const maxValue = Math.max(...values, field.max === "" || field.max == null ? -Infinity : Number(field.max));
  const padding = (maxValue - minValue || 1) * 0.12;
  const low = minValue - padding;
  const high = maxValue + padding;
  const x = (index) => 32 + (rows.length === 1 ? 0 : index * (width - 64) / (rows.length - 1));
  const y = (value) => height - 30 - (value - low) * (height - 55) / (high - low);
  const path = rows.map((row, index) => `${index ? "L" : "M"} ${x(index)} ${y(row.value)}`).join(" ");
  const minLine = field.min === "" || field.min == null ? null : Number(field.min);
  const maxLine = field.max === "" || field.max == null ? null : Number(field.max);
  return <div className="trend-chart">
    <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`Tendencia de ${field.n}`} preserveAspectRatio="none">
      <line x1="30" y1={height - 30} x2={width - 24} y2={height - 30} className="axis" />
      {minLine !== null && <line x1="30" y1={y(minLine)} x2={width - 24} y2={y(minLine)} className="limit" />}
      {maxLine !== null && <line x1="30" y1={y(maxLine)} x2={width - 24} y2={y(maxLine)} className="limit" />}
      <path d={path} className="trend-line" />
      {rows.map((row, index) => <circle key={`${row.date}-${index}`} cx={x(index)} cy={y(row.value)} r="4" className="trend-point"><title>{row.date}: {row.value}</title></circle>)}
    </svg>
    <div className="trend-labels"><span>{rows[0].date}</span><b>{field.n}{field.u ? ` (${field.u})` : ""}</b><span>{rows.at(-1).date}</span></div>
    {(minLine !== null || maxLine !== null) && <p className="hint">Límites permitidos: {minLine ?? "—"} a {maxLine ?? "—"}</p>}
  </div>;
}

function Empty({ children = "Aún no hay elementos." }) {
  return <p className="empty">{children}</p>;
}

function RequestIndicator({ requestState }) {
  if (!requestState.pending) return null;
  return (
    <div className="request-indicator" role="status" aria-live="polite">
      <span className="loading-spinner" aria-hidden="true" />
      {requestState.writes > 0 ? "Guardando cambios…" : "Cargando…"}
    </div>
  );
}

export default function App() {
  const [token, setToken] = useState(() => sessionStorage.getItem("lechona_access_token") || "");
  const [data, setData] = useState(null);
  const [currentUser, setCurrentUser] = useState(null);
  const [view, setView] = useState("dash");
  const [moduleId, setModuleId] = useState("agua");
  const [tab, setTab] = useState("res");
  const [month, setMonth] = useState(DEFAULT_MONTH);
  const [preferredFormatId, setPreferredFormatId] = useState("");
  const [report, setReport] = useState(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(true);
  const [requestState, setRequestState] = useState({ pending: 0, writes: 0 });

  useEffect(() => {
    const updateRequestState = (event) => setRequestState(event.detail);
    window.addEventListener("lechona:request-state", updateRequestState);
    return () => window.removeEventListener("lechona:request-state", updateRequestState);
  }, []);
  const refresh = useCallback(async () => {
    if (!sessionStorage.getItem("lechona_access_token")) {
      setData(null);
      setCurrentUser(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");
    try {
      const [bootstrap, user] = await Promise.all([api("/bootstrap"), api("/auth/me")]);
      setData(bootstrap);
      setCurrentUser(user);
    } catch (reason) {
      setError(reason.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh, token]);
  useEffect(() => {
    const expireSession = () => {
      sessionStorage.removeItem("lechona_access_token");
      setToken("");
      setData(null);
      setCurrentUser(null);
    };
    window.addEventListener("lechona:auth-expired", expireSession);
    return () => window.removeEventListener("lechona:auth-expired", expireSession);
  }, []);
  useEffect(() => {
    if (!data) return;
    api(`/reports?month=${encodeURIComponent(month)}${view !== "dash" && view !== "mae" && view !== "bk" && view !== "users" ? `&module=${encodeURIComponent(moduleId)}` : ""}`)
      .then(setReport)
      .catch((reason) => setError(reason.message));
  }, [data, month, moduleId, view]);

  const notify = useCallback(async (operation, successMessage) => {
    setError("");
    setNotice("");
    try {
      await operation();
      if (successMessage) setNotice(successMessage);
      await refresh();
      return true;
    } catch (reason) {
      setError(reason.message);
      return false;
    }
  }, [refresh]);

  const openModule = (id) => {
    setModuleId(id);
    setView(id);
    setTab("res");
  };

  const handleLogin = (accessToken) => {
    sessionStorage.setItem("lechona_access_token", accessToken);
    setToken(accessToken);
  };
  const logout = () => {
    sessionStorage.removeItem("lechona_access_token");
    setToken("");
    setData(null);
    setCurrentUser(null);
    setView("dash");
    setError("");
    setNotice("");
  };

  if (!token) return <><RequestIndicator requestState={requestState} /><Login onLogin={handleLogin} /></>;
  if (loading && !data) return <><RequestIndicator requestState={requestState} /><div className="center-state">Cargando el sistema…</div></>;
  if (!data) {
    return (
      <div className="center-state">
        <h1>No se pudo cargar la aplicación</h1>
        <p>{error || "No se recibió información del servidor."}</p>
        <button className="primary" onClick={refresh}>Intentar de nuevo</button>
      </div>
    );
  }

  const module = data.modules.find((item) => item.id === moduleId);
  const program = data.programs[moduleId];
  const isSpecialView = ["dash", "mae", "bk", "users"].includes(view);
  const canManageUsers = currentUser && ["super", "user_admin"].includes(currentUser.role);
  const currentMonthReport = report;

  return (
    <div className="layout">
      <RequestIndicator requestState={requestState} />
      <aside className="sidebar no-print">
        <div className="brand">
          <div className="brand-mark">DL</div>
          <strong>Diego Lechona</strong>
          <span>Calidad e inocuidad</span>
        </div>
        <button className={`nav-item ${view === "dash" ? "active" : ""}`} onClick={() => setView("dash")}>Dashboard</button>
        <div className="nav-label">Programas</div>
        {data.modules.map((item) => (
          <button key={item.id} className={`nav-item ${view === item.id ? "active" : ""}`} onClick={() => openModule(item.id)}>
            {item.name}
          </button>
        ))}
        <div className="nav-label">Administración</div>
        <button className={`nav-item ${view === "mae" ? "active" : ""}`} onClick={() => setView("mae")}>Maestros</button>
        {/* <button className={`nav-item ${view === "bk" ? "active" : ""}`} onClick={() => setView("bk")}>Backup / Datos</button> */}
        {canManageUsers && <button className={`nav-item ${view === "users" ? "active" : ""}`} onClick={() => setView("users")}>Usuarios</button>}
      </aside>
      <main className="content">
        <header className="topbar no-print">
          <div>
            <span className="eyebrow">GESTIÓN DE CALIDAD E INOCUIDAD</span>
            <h1>{view === "dash" ? "Dashboard" : view === "mae" ? "Maestros" : view === "bk" ? "Backup / Datos" : view === "users" ? "Usuarios" : module?.name}</h1>
          </div>
          <div className="topbar-actions">
          {!isSpecialView && (
            <label className="month-picker">
              Mes de trabajo
              <input type="month" value={month} onChange={(event) => setMonth(event.target.value)} />
            </label>
          )}
            <div className="signed-in-user">
              <span>{currentUser?.name || currentUser?.username}</span>
              <small>{currentUser?.role === "super" ? "Super administrador" : currentUser?.role === "user_admin" ? "Administrador de usuarios" : "Usuario"}</small>
            </div>
            <button onClick={logout}>Cerrar sesión</button>
          </div>
        </header>

        {error && <div className="message error" role="alert">{error}<button onClick={() => setError("")}>Cerrar</button></div>}
        {notice && <div className="message success" role="status">{notice}<button onClick={() => setNotice("")}>Cerrar</button></div>}
        {view === "dash" && <Dashboard data={data} report={currentMonthReport} month={month} onPrint={() => window.print()} />}
        {view === "mae" && <Masters data={data} notify={notify} setError={setError} />}
        {view === "bk" && <Backup lastBackup={data.lastBackup} month={month} notify={notify} />}
        {view === "users" && canManageUsers && <UserManagement currentUser={currentUser} />}
        {!isSpecialView && program && (
          <>
            <nav className="tabs no-print">
              {[
                ["res", "Resumen"], ["doc", "Documentos"], ["fmt", "Formatos"],
                ["reg", "Registros"], ["cro", "Cronograma"], ["acc", "Acciones correctivas"],
                ["ale", "Alertas"], ["inf", "Informe"],
                ...(moduleId === "traz" ? [["rast", "Rastreo de lote"]] : []),
              ].map(([id, label]) => (
                <button key={id} className={tab === id ? "selected" : ""} onClick={() => setTab(id)}>{label}</button>
              ))}
            </nav>
            {tab === "res" && <ProgramSummary program={program} report={currentMonthReport} moduleId={moduleId} />}
            {tab === "doc" && <Documents moduleId={moduleId} documents={program.documents} notify={notify} />}
            {tab === "fmt" && <Formats moduleId={moduleId} formats={program.formats} notify={notify} onSelectFormat={(id) => { setPreferredFormatId(id); setTab("reg"); }} />}
            {tab === "reg" && <Records moduleId={moduleId} program={program} masters={data.masters} month={month} notify={notify} preferredFormatId={preferredFormatId} />}
            {tab === "cro" && <Schedules moduleId={moduleId} schedules={program.schedules} notify={notify} />}
            {tab === "acc" && <Actions moduleId={moduleId} actions={program.actions} notify={notify} />}
            {tab === "ale" && <Alerts alerts={currentMonthReport?.alerts || []} />}
            {tab === "inf" && <Report report={currentMonthReport} month={month} onPrint={() => window.print()} />}
            {tab === "rast" && moduleId === "traz" && <Traceability />}
          </>
        )}
      </main>
    </div>
  );
}

function Login({ onLogin }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const submit = async (event) => {
    event.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      const result = await api("/auth/login", {
        method: "POST",
        body: JSON.stringify({ username, password }),
      });
      onLogin(result.token);
    } catch (reason) {
      setError(reason.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="login-page">
      <form className="login-card" onSubmit={submit}>
        <div className="brand-mark login-mark">DL</div>
        <span className="eyebrow">GESTIÓN DE CALIDAD E INOCUIDAD</span>
        <h1>Iniciar sesión</h1>
        <p>Ingresa con la cuenta que te asignó el administrador.</p>
        {error && <div className="message error" role="alert">{error}</div>}
        <label>Usuario
          <input autoComplete="username" required autoFocus value={username} onChange={(event) => setUsername(event.target.value)} />
        </label>
        <label>Contraseña
          <input type="password" autoComplete="current-password" required value={password} onChange={(event) => setPassword(event.target.value)} />
        </label>
        <button className="primary login-submit" disabled={submitting}>
          {submitting ? "Validando…" : "Entrar"}
        </button>
      </form>
    </main>
  );
}

function Stats({ totals }) {
  if (!totals) return <div className="card muted">Cargando indicadores…</div>;
  return (
    <div className="stats-grid">
      <div className="stat"><strong>{totals.records}</strong><span>Registros del mes</span></div>
      <div className="stat danger"><strong>{totals.deviations}</strong><span>Desviaciones</span></div>
      <div className="stat"><strong>{totals.conformity}%</strong><span>Conformidad</span></div>
      <div className="stat danger"><strong>{totals.openActions}</strong><span>Acciones abiertas</span></div>
      <div className="stat danger"><strong>{totals.overdueSchedules}</strong><span>Actividades vencidas</span></div>
    </div>
  );
}

function AlertList({ alerts = [] }) {
  if (!alerts.length) return <Empty>✅ Sin alertas para este periodo.</Empty>;
  return <div className="alert-list">{alerts.map((alert, index) => (
    <div className="alert" key={`${alert.moduleId}-${index}`}>
      <b>{alert.kind}</b><span>{alert.moduleName || ""}</span><p>{alert.description}</p>
    </div>
  ))}</div>;
}

function Dashboard({ data, report, month, onPrint }) {
  const numericFields = data.modules.flatMap((item) => data.programs[item.id].formats.flatMap((format) =>
    format.fields.filter((field) => field.t === "num").map((field) => ({
      id: `${item.id}|${format.id}|${field.n}`,
      moduleId: item.id,
      formatId: format.id,
      field,
      label: `${item.name} › ${format.name} › ${field.n}`,
    })),
  ));
  const [seriesId, setSeriesId] = useState("");
  const selectedSeries = numericFields.find((item) => item.id === seriesId) || numericFields[0];
  const bars = data.modules.map((module) => {
    const rows = data.programs[module.id].records.filter((record) => record.date.startsWith(month));
    return { ...module, total: rows.length, deviations: rows.filter((record) => record.devs.length).length };
  });
  const seriesRecords = selectedSeries
    ? data.programs[selectedSeries.moduleId].records
      .filter((record) => record.fmt === selectedSeries.formatId && record.date.startsWith(month) && record.vals[selectedSeries.field.n] !== "")
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((record) => ({ date: record.date, value: Number(record.vals[selectedSeries.field.n]) }))
      .filter((record) => Number.isFinite(record.value))
    : [];
  return (
    <>
      <Stats totals={report?.totals} />
      <div className="dashboard-panels">
        <div className="card">
          <div className="section-heading"><div><h2>Registros por programa</h2><p>Actividad registrada en {month}</p></div></div>
          <div className="program-bars">
            {bars.map((item) => (
              <div className="bar-row" key={item.id}>
                <span>{item.name}</span>
                <div className="bar-track"><i style={{ width: `${Math.max(2, item.total ? item.total * 100 / Math.max(...bars.map((bar) => bar.total), 1) : 0)}%` }} /></div>
                <b>{item.total}</b><em>{item.deviations} desviación(es)</em>
              </div>
            ))}
          </div>
        </div>
        <div className="card">
          <h2>Tendencia de variable</h2>
          {numericFields.length ? <>
            <label className="compact-label">Variable numérica<select value={selectedSeries?.id || ""} onChange={(event) => setSeriesId(event.target.value)}>
              {numericFields.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
            </select></label>
            <TrendChart rows={seriesRecords} field={selectedSeries.field} />
          </> : <Empty>No hay campos numéricos en los formatos.</Empty>}
        </div>
      </div>
      <div className="card"><h2>Alertas del mes</h2><AlertList alerts={report?.alerts} /></div>
      <div className="card no-print action-row">
        <button className="primary" onClick={onPrint}>Imprimir / guardar informe en PDF</button>
        <button onClick={() => exportReportCsv(report, month)}>Descargar informe general CSV</button>
      </div>
    </>
  );
}

function ProgramSummary({ program, report, moduleId }) {
  const relevant = report?.records?.filter((row) => row.moduleId === moduleId) || [];
  return (
    <>
      <Stats totals={report?.totals} />
      <div className="card"><h2>Alertas</h2><AlertList alerts={report?.alerts || []} /></div>
      <div className="card"><h2>Últimos registros</h2>
        {relevant.length ? <Table headers={["Fecha", "Formato", "Responsable", "Estado"]}>
          {relevant.slice(-8).reverse().map((row, index) => <tr key={`${row.date}-${index}`}><td>{row.date}</td><td>{row.format}</td><td>{row.responsible || "—"}</td><td><StatusTag bad={row.deviations.length > 0}>{row.deviations.length ? "Desviación" : "OK"}</StatusTag></td></tr>)}
        </Table> : <Empty>No hay registros este mes.</Empty>}
      </div>
      <div className="card muted">Documentos: {program.documents.length} · Formatos: {program.formats.length} · Cronograma: {program.schedules.length} · Acciones: {program.actions.length}</div>
    </>
  );
}

function StatusTag({ bad, children }) {
  return <span className={`tag ${bad ? "bad" : "good"}`}>{children}</span>;
}

function Masters({ data, notify, setError }) {
  const [category, setCategory] = useState("");
  const [value, setValue] = useState("");
  const [filter, setFilter] = useState("");
  const name = MASTER_NAMES[category];
  const items = data.masters[category] || [];
  const filteredItems = items.filter((item) =>
    item.value.toLocaleLowerCase("es").includes(filter.trim().toLocaleLowerCase("es")),
  );

  const openCategory = (nextCategory) => {
    setCategory(nextCategory);
    setFilter("");
    setValue("");
    setError("");
  };

  const addItem = async (event) => {
    event.preventDefault();
    const normalizedValue = value.trim();
    if (!normalizedValue) {
      setError("Escribe un nombre antes de agregarlo.");
      return;
    }
    const alreadyExists = items.some((item) =>
      item.value.toLocaleLowerCase("es") === normalizedValue.toLocaleLowerCase("es"),
    );
    if (alreadyExists) {
      setError(`“${normalizedValue}” ya existe en ${name.toLocaleLowerCase("es")}.`);
      return;
    }
    const saved = await notify(
      () => api(`/masters/${category}`, { method: "POST", body: JSON.stringify({ value: normalizedValue }) }),
      `Se agregó el elemento a ${name.toLocaleLowerCase("es")}.`,
    );
    if (saved) setValue("");
  };

  const removeItem = (item) => {
    if (!window.confirm(`¿Deseas eliminar “${item.value}” de ${name}?`)) return;
    notify(
      () => api(`/masters/${category}/${item.id}`, { method: "DELETE" }),
      `Se eliminó “${item.value}” de ${name.toLocaleLowerCase("es")}.`,
    );
  };

  if (category) {
    return (
      <section className="card master-detail">
        <div className="master-detail-heading">
          <div>
            <button className="back-button no-print" onClick={() => openCategory("")}>← Todos los maestros</button>
            <h2>{name}</h2>
            <p>Agrega, consulta y administra los elementos de este maestro.</p>
          </div>
          <span className="count-badge">{items.length} {items.length === 1 ? "elemento" : "elementos"}</span>
        </div>

        <form className="master-toolbar" onSubmit={addItem}>
          <label className="master-create">
            Nuevo {name.toLocaleLowerCase("es")}
            <input
              autoFocus
              value={value}
              onChange={(event) => setValue(event.target.value)}
              placeholder={`Escribe el nombre de ${name.toLocaleLowerCase("es")}`}
              maxLength={200}
            />
          </label>
          <button className="primary" type="submit">Agregar</button>
          <label className="master-filter">
            Filtrar tabla
            <input
              type="search"
              value={filter}
              onChange={(event) => setFilter(event.target.value)}
              placeholder={`Buscar en ${name.toLocaleLowerCase("es")}…`}
            />
          </label>
        </form>

        <div className="master-table-summary">
          {filter.trim()
            ? `${filteredItems.length} resultado(s) para “${filter.trim()}”`
            : `Mostrando ${filteredItems.length} de ${items.length} elemento(s)`}
        </div>
        {filteredItems.length ? (
          <Table headers={["#", "Nombre", "Fecha de creación", "Acciones"]}>
            {filteredItems.map((item, index) => (
              <tr key={item.id}>
                <td>{index + 1}</td>
                <td className="master-value">{item.value}</td>
                <td>{item.createdAt ? new Date(item.createdAt).toLocaleDateString("es-CO") : "—"}</td>
                <td>
                  <button className="danger-button" onClick={() => removeItem(item)}>Eliminar</button>
                </td>
              </tr>
            ))}
          </Table>
        ) : (
          <Empty>
            {filter.trim()
              ? "No hay elementos que coincidan con el filtro."
              : "Este maestro está vacío. Usa el formulario para agregar el primer elemento."}
          </Empty>
        )}
      </section>
    );
  }

  return (
    <>
      <div className="master-intro">
        <p>Selecciona un maestro para administrar sus elementos. Cada lista se mantiene separada.</p>
      </div>
      <div className="master-grid">
        {Object.entries(MASTER_NAMES).map(([key, label]) => {
          const count = (data.masters[key] || []).length;
          return (
            <button className="master-card" key={key} onClick={() => openCategory(key)}>
              <span className="master-card-icon">{label.charAt(0)}</span>
              <span className="master-card-copy">
                <strong>{label}</strong>
                <small>{count} {count === 1 ? "elemento" : "elementos"} registrados</small>
              </span>
              <span className="master-card-arrow" aria-hidden="true">→</span>
            </button>
          );
        })}
      </div>
    </>
  );
}

function Documents({ moduleId, documents, notify }) {
  const [form, setForm] = useState({ name: "", tipo: "Programa", ver: "1", rev: "" });
  const add = async (event) => {
    event.preventDefault();
    const file = event.currentTarget.file.files[0];
    if (file && file.size > 1_500_000) return window.alert("El archivo no puede superar 1,5 MB.");
    let data = "";
    try {
      data = file ? await fileToDataUrl(file) : "";
    } catch (reason) {
      return window.alert(reason.message);
    }
    const saved = await notify(() => api(`/modules/${moduleId}/documents`, {
      method: "POST",
      body: JSON.stringify({ ...form, file: file?.name || "", data }),
    }), "Documento guardado.");
    if (saved) setForm({ name: "", tipo: "Programa", ver: "1", rev: "" });
  };
  return (
    <>
      <section className="card">
        <h2>Subir documento</h2>
        <form className="form-grid" onSubmit={add}>
          <label>Nombre<input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></label>
          <label>Tipo<select value={form.tipo} onChange={(e) => setForm({ ...form, tipo: e.target.value })}>{["Programa", "Formato", "Procedimiento", "Registro", "Otro"].map((value) => <option key={value}>{value}</option>)}</select></label>
          <label>Versión<input value={form.ver} onChange={(e) => setForm({ ...form, ver: e.target.value })} /></label>
          <label>Próxima revisión<input type="date" value={form.rev} onChange={(e) => setForm({ ...form, rev: e.target.value })} /></label>
          <label>Archivo<input name="file" type="file" /></label>
          <button className="primary">Guardar documento</button>
        </form>
        <p className="hint">Los archivos de hasta 1,5 MB se almacenan con sus datos en Neon.</p>
      </section>
      <section className="card"><h2>Documentos registrados</h2>
        {documents.length ? <Table headers={["Documento", "Tipo", "Versión", "Revisión", "Archivo", ""]}>
          {documents.map((item) => <tr key={item.id}><td>{item.name}</td><td>{item.tipo}</td><td>{item.ver}</td><td>{item.rev || "—"}</td><td>{item.data ? <a download={item.file} href={item.data}>Descargar {item.file}</a> : "—"}</td><td><button className="danger-button" onClick={() => notify(() => api(`/modules/${moduleId}/documents/${item.id}`, { method: "DELETE" }), "Documento eliminado.")}>Eliminar</button></td></tr>)}
        </Table> : <Empty />}</section>
    </>
  );
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("No fue posible leer el archivo."));
    reader.readAsDataURL(file);
  });
}

function Formats({ moduleId, formats, notify, onSelectFormat }) {
  const [editing, setEditing] = useState(null);
  const startNew = () => setEditing({ name: "", freq: "Diario", fields: [newField()] });
  const edit = (format) => setEditing({ ...format, fields: format.fields.map((field) => ({ ...field })) });
  const updateField = (index, key, value) => setEditing((current) => ({
    ...current, fields: current.fields.map((field, i) => i === index ? { ...field, [key]: value } : field),
  }));
  const save = async () => {
    if (!editing.name.trim() || !editing.fields.length || editing.fields.some((field) => !field.n.trim())) {
      return window.alert("Ingresa el nombre del formato y el nombre de cada campo.");
    }
    const method = editing.id ? "PUT" : "POST";
    const url = `/modules/${moduleId}/formats${editing.id ? `/${editing.id}` : ""}`;
    const saved = await notify(() => api(url, { method, body: JSON.stringify(editing) }), "Formato guardado.");
    if (saved) setEditing(null);
  };
  return (
    <>
      {editing ? <section className="card">
        <h2>{editing.id ? "Editar formato" : "Nuevo formato"}</h2>
        <div className="form-grid">
          <label>Nombre<input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} /></label>
          <label>Frecuencia<select value={editing.freq} onChange={(e) => setEditing({ ...editing, freq: e.target.value })}>{["Diario", "Semanal", "Quincenal", "Mensual", "Por evento"].map((value) => <option key={value}>{value}</option>)}</select></label>
        </div>
        <Table headers={["Campo", "Tipo", "Unidad u opciones", "Mínimo", "Máximo", ""]}>
          {editing.fields.map((field, index) => <tr key={index}>
            <td><input value={field.n} onChange={(e) => updateField(index, "n", e.target.value)} /></td>
            <td><select value={field.t} onChange={(e) => updateField(index, "t", e.target.value)}>{Object.entries(FIELD_TYPES).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></td>
            <td><input value={field.u} placeholder={field.t === "sel" ? "opción 1, opción 2" : ""} onChange={(e) => updateField(index, "u", e.target.value)} /></td>
            <td><input type="number" step="any" value={field.min ?? ""} onChange={(e) => updateField(index, "min", e.target.value)} /></td>
            <td><input type="number" step="any" value={field.max ?? ""} onChange={(e) => updateField(index, "max", e.target.value)} /></td>
            <td><button className="icon-button" onClick={() => setEditing({ ...editing, fields: editing.fields.filter((_, i) => i !== index) })}>×</button></td>
          </tr>)}
        </Table>
        <div className="action-row">
          <button onClick={() => setEditing({ ...editing, fields: [...editing.fields, newField()] })}>+ Agregar campo</button>
          <button className="primary" onClick={save}>Guardar formato</button>
          <button onClick={() => setEditing(null)}>Cancelar</button>
        </div>
      </section> : <div className="action-row no-print"><button className="primary" onClick={startNew}>+ Crear formato</button></div>}
      <section className="card"><h2>Formatos</h2>
        {formats.length ? <Table headers={["Formato", "Frecuencia", "Campos", "Acciones"]}>
          {formats.map((format) => <tr key={format.id}><td>{format.name}</td><td>{format.freq}</td><td>{format.fields.map((field) => field.n).join(", ")}</td>
            <td className="action-cell"><button onClick={() => onSelectFormat(format.id)}>Registrar</button><button onClick={() => edit(format)}>Editar</button><button className="danger-button" onClick={() => {
              if (window.confirm("¿Eliminar formato? Los registros existentes se conservarán.")) notify(() => api(`/modules/${moduleId}/formats/${format.id}`, { method: "DELETE" }), "Formato eliminado.");
            }}>Eliminar</button></td></tr>)}
        </Table> : <Empty>Crea tu primer formato para empezar.</Empty>}</section>
    </>
  );
}

function Records({ moduleId, program, masters, month, notify, preferredFormatId }) {
  const [formatId, setFormatId] = useState(program.formats[0]?.id || "");
  const [values, setValues] = useState({});
  const [meta, setMeta] = useState({ date: TODAY, resp: "", obs: "" });
  useEffect(() => {
    if (preferredFormatId && program.formats.some((format) => format.id === preferredFormatId)) {
      setFormatId(preferredFormatId);
    }
  }, [preferredFormatId, program.formats]);
  const format = program.formats.find((item) => item.id === formatId);
  const rows = program.records.filter((record) => record.fmt === formatId && record.date.startsWith(month));
  const save = async (event) => {
    event.preventDefault();
    if (!format) return;
    const saved = await notify(() => api(`/modules/${moduleId}/records`, {
      method: "POST",
      body: JSON.stringify({ fmt: format.id, ...meta, vals: values }),
    }), "Registro guardado.");
    if (saved) { setValues({}); setMeta({ date: TODAY, resp: "", obs: "" }); }
  };
  if (!program.formats.length) return <section className="card"><Empty>Crea primero un formato en la pestaña Formatos.</Empty></section>;
  return (
    <>
      <section className="card">
        <h2>Nuevo registro</h2>
        <label className="compact-label">Formato<select id="record-format" value={formatId} onChange={(e) => setFormatId(e.target.value)}>{program.formats.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        {format && <form className="form-grid record-form" onSubmit={save}>
          <label>Fecha<input type="date" required value={meta.date} onChange={(e) => setMeta({ ...meta, date: e.target.value })} /></label>
          <label>Responsable<input value={meta.resp} onChange={(e) => setMeta({ ...meta, resp: e.target.value })} /></label>
          {format.fields.map((field) => <FieldInput key={field.n} field={field} masters={masters} value={values[field.n] ?? ""} onChange={(value) => setValues({ ...values, [field.n]: value })} />)}
          <label className="wide-field">Observaciones<input value={meta.obs} onChange={(e) => setMeta({ ...meta, obs: e.target.value })} /></label>
          <button className="primary">Guardar registro</button>
        </form>}
      </section>
      <section className="card"><h2>Histórico {month} · {rows.length}</h2>
        {rows.length ? <Table headers={["Fecha", "Responsable", ...format.fields.map((field) => field.n), "Observaciones", "Estado", ""]}>
          {rows.map((record) => <tr key={record.id} className={record.devs.length ? "bad-row" : ""}>
            <td>{record.date}</td><td>{record.resp || "—"}</td>{format.fields.map((field) => <td key={field.n} className={record.devs.some((item) => item.startsWith(`${field.n}:`)) ? "bad-value" : ""}>{record.vals[field.n] ?? ""}</td>)}
            <td>{record.obs}</td><td><StatusTag bad={record.devs.length > 0}>{record.devs.length ? "Desviación" : "OK"}</StatusTag></td>
            <td><button className="danger-button" onClick={() => {
              if (window.confirm("¿Eliminar este registro?")) notify(() => api(`/modules/${moduleId}/records/${record.id}`, { method: "DELETE" }), "Registro eliminado.");
            }}>Eliminar</button></td>
          </tr>)}
        </Table> : <Empty>No hay registros para este formato y mes.</Empty>}</section>
    </>
  );
}

function FieldInput({ field, masters, value, onChange }) {
  const masterCategory = { producto: "productos", area: "areas", punto: "puntos", proveedor: "proveedores", cliente: "clientes", equipo: "equipos" }[field.t];
  const label = `${field.n}${field.t === "num" && (field.u || field.min !== "" || field.max !== "") ? ` (${field.u}${field.min !== "" || field.max !== "" ? ` ${field.min ?? ""}–${field.max ?? ""}` : ""})` : ""}`;
  if (field.t === "chk") return <label>{label}<select value={value} onChange={(e) => onChange(e.target.value)}><option value="">Seleccionar…</option><option>Sí</option><option>No</option></select></label>;
  if (field.t === "sel") return <label>{label}<select value={value} onChange={(e) => onChange(e.target.value)}><option value="">Seleccionar…</option>{String(field.u || "").split(",").map((item) => item.trim()).filter(Boolean).map((item) => <option key={item}>{item}</option>)}</select></label>;
  if (masterCategory) return <label>{label}<input list={`master-${field.t}`} value={value} onChange={(e) => onChange(e.target.value)} placeholder="Elegir o escribir" /><datalist id={`master-${field.t}`}>{(masters[masterCategory] || []).map((item) => <option key={item.id} value={item.value} />)}</datalist></label>;
  return <label>{label}<input type={field.t === "num" ? "number" : field.t === "date" ? "date" : "text"} step={field.t === "num" ? "any" : undefined} value={value} onChange={(e) => onChange(e.target.value)} /></label>;
}

function Schedules({ moduleId, schedules, notify }) {
  const [form, setForm] = useState({ name: "", date: TODAY, rep: "Única", resp: "" });
  const add = async (event) => {
    event.preventDefault();
    const saved = await notify(() => api(`/modules/${moduleId}/schedules`, { method: "POST", body: JSON.stringify(form) }), "Actividad agregada.");
    if (saved) setForm({ name: "", date: TODAY, rep: "Única", resp: "" });
  };
  return <>
    <section className="card"><h2>Agregar actividad</h2><form className="form-grid" onSubmit={add}>
      <label>Actividad<input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></label>
      <label>Fecha<input type="date" required value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} /></label>
      <label>Repetir<select value={form.rep} onChange={(e) => setForm({ ...form, rep: e.target.value })}>{[["Única", "Única"], ["1", "Diaria"], ["7", "Semanal"], ["15", "Quincenal"], ["30", "Mensual"], ["90", "Trimestral"], ["180", "Semestral"], ["365", "Anual"]].map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      <label>Responsable<input value={form.resp} onChange={(e) => setForm({ ...form, resp: e.target.value })} /></label><button className="primary">Agregar</button>
    </form></section>
    <section className="card"><h2>Cronograma</h2>{schedules.length ? <Table headers={["Actividad", "Fecha", "Repetición", "Responsable", "Estado", ""]}>
      {schedules.map((item) => <tr key={item.id}><td>{item.name}</td><td>{item.date}</td><td>{item.rep === "Única" ? "Única" : `Cada ${item.rep} días`}</td><td>{item.resp || "—"}</td><td><StatusTag bad={!item.ok && item.date < TODAY}>{item.ok ? "Cumplida" : item.date < TODAY ? "Vencida" : "Pendiente"}</StatusTag></td>
        <td className="action-cell">{!item.ok && <button onClick={() => notify(() => api(`/modules/${moduleId}/schedules/${item.id}/complete`, { method: "POST", body: JSON.stringify({}) }), "Actividad marcada como cumplida.")}>✓ Cumplir</button>}<button className="danger-button" onClick={() => notify(() => api(`/modules/${moduleId}/schedules/${item.id}`, { method: "DELETE" }), "Actividad eliminada.")}>Eliminar</button></td></tr>)}
    </Table> : <Empty />}</section>
  </>;
}

function Actions({ moduleId, actions, notify }) {
  const [form, setForm] = useState({ desc: "", resp: "", due: new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10) });
  const add = async (event) => {
    event.preventDefault();
    const saved = await notify(() => api(`/modules/${moduleId}/actions`, { method: "POST", body: JSON.stringify(form) }), "Acción correctiva creada.");
    if (saved) setForm({ desc: "", resp: "", due: form.due });
  };
  return <>
    <section className="card"><h2>Crear acción correctiva</h2><form className="form-grid" onSubmit={add}>
      <label className="wide-field">Descripción<input required value={form.desc} onChange={(e) => setForm({ ...form, desc: e.target.value })} /></label>
      <label>Responsable<input value={form.resp} onChange={(e) => setForm({ ...form, resp: e.target.value })} /></label>
      <label>Fecha límite<input type="date" required value={form.due} onChange={(e) => setForm({ ...form, due: e.target.value })} /></label><button className="primary">Crear acción</button>
    </form></section>
    <section className="card"><h2>Acciones</h2>{actions.length ? <Table headers={["Acción", "Responsable", "Límite", "Estado", "Cierre", ""]}>
      {actions.map((item) => <tr className={item.e === "Abierta" && item.due < TODAY ? "bad-row" : ""} key={item.id}><td>{item.desc}</td><td>{item.resp || "—"}</td><td>{item.due}</td><td>{item.e}</td><td>{item.cierre}</td><td className="action-cell">
        {item.e === "Abierta" && <button onClick={() => {
          const cierre = window.prompt("Describe la acción realizada y la verificación de eficacia:");
          if (cierre !== null) notify(() => api(`/modules/${moduleId}/actions/${item.id}/close`, { method: "POST", body: JSON.stringify({ cierre }) }), "Acción cerrada.");
        }}>Cerrar</button>}
        <button className="danger-button" onClick={() => notify(() => api(`/modules/${moduleId}/actions/${item.id}`, { method: "DELETE" }), "Acción eliminada.")}>Eliminar</button>
      </td></tr>)}
    </Table> : <Empty />}</section>
  </>;
}

function Alerts({ alerts }) {
  return <section className="card"><h2>Alertas del mes</h2><AlertList alerts={alerts} /></section>;
}

function Report({ report, month, onPrint }) {
  if (!report) return <section className="card muted">Cargando informe…</section>;
  return <>
    <div className="card no-print action-row"><button className="primary" onClick={onPrint}>Imprimir / guardar PDF</button><button onClick={() => exportReportCsv(report, month)}>Descargar CSV (Excel)</button></div>
    <div className="card printable-report">
      <h2>Informe · {month}</h2><Stats totals={report.totals} />
      <h2>Alertas</h2><AlertList alerts={report.alerts} />
      <h2>Registros</h2><ReportRows report={report} />
    </div>
  </>;
}

function ReportRows({ report }) {
  return report.records.length ? <Table headers={["Programa", "Formato", "Fecha", "Responsable", "Datos", "Desviaciones", "Observaciones"]}>
    {report.records.map((row, index) => <tr className={row.deviations.length ? "bad-row" : ""} key={`${row.moduleId}-${row.date}-${index}`}>
      <td>{row.moduleName}</td><td>{row.format}</td><td>{row.date}</td><td>{row.responsible}</td>
      <td>{Object.entries(row.values).map(([key, value]) => `${key}=${value}`).join("; ")}</td><td>{row.deviations.join(" | ")}</td><td>{row.observations}</td>
    </tr>)}
  </Table> : <Empty>No hay registros para este periodo.</Empty>;
}

function exportReportCsv(report, month) {
  if (!report) return;
  const header = ["Programa", "Formato", "Fecha", "Responsable", "Datos", "Desviaciones", "Observaciones"];
  const body = report.records.map((row) => [
    row.moduleName, row.format, row.date, row.responsible,
    Object.entries(row.values).map(([key, value]) => `${key}=${value}`).join("; "),
    row.deviations.join(" | "), row.observations,
  ]);
  saveFile(`informe_calidad_${month}.csv`, [header, ...body].map((row) => row.map(csvCell).join(",")).join("\r\n"), "text/csv;charset=utf-8");
}

function Traceability() {
  const [lot, setLot] = useState("");
  const [results, setResults] = useState(null);
  const [error, setError] = useState("");
  const search = async (event) => {
    event.preventDefault();
    setError("");
    try {
      const result = await api(`/trace?lot=${encodeURIComponent(lot)}`);
      setResults(result.results);
    } catch (reason) { setError(reason.message); }
  };
  return <>
    <section className="card"><h2>Rastreo de lote</h2><form className="inline-form" onSubmit={search}>
      <label>Número de lote (proveedor o interno)<input value={lot} onChange={(e) => setLot(e.target.value)} /></label><button className="primary">Rastrear</button>
    </form><p className="hint">Busca el lote en todos los programas y muestra los registros cronológicamente para apoyar un recall.</p>{error && <p className="error-text">{error}</p>}</section>
    {results && <section className="card"><h2>{results.length} registro(s) con el lote “{lot}”</h2>
      {results.length ? <Table headers={["Fecha", "Programa", "Formato", "Datos", "Estado"]}>
        {results.map((record) => <tr className={record.devs.length ? "bad-row" : ""} key={record.id}><td>{record.date}</td><td>{record.moduleName}</td><td>{record.formatName}</td><td>{Object.entries(record.vals).map(([key, value]) => `${key}: ${value}`).join(" · ")}</td><td>{record.devs.length ? "Desviación" : "OK"}</td></tr>)}
      </Table> : <Empty>No se encontraron coincidencias.</Empty>}
    </section>}
  </>;
}

function UserManagement({ currentUser }) {
  const [users, setUsers] = useState([]);
  const [form, setForm] = useState({ username: "", name: "", password: "", role: "user" });
  const [filter, setFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const isSuper = currentUser?.role === "super";

  const loadUsers = useCallback(async () => {
    setLoading(true);
    try {
      setUsers(await api("/auth/users"));
      setError("");
    } catch (reason) {
      setError(reason.message);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { loadUsers(); }, [loadUsers]);

  const filteredUsers = users.filter((user) =>
    `${user.name} ${user.username} ${user.role}`.toLocaleLowerCase("es").includes(filter.trim().toLocaleLowerCase("es")),
  );

  const createUser = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const created = await api("/auth/users", {
        method: "POST",
        body: JSON.stringify(form),
      });
      setNotice(`Cuenta “${created.username}” creada. Comparte la contraseña de forma segura.`);
      setForm({ username: "", name: "", password: "", role: "user" });
      await loadUsers();
    } catch (reason) {
      setError(reason.message);
    } finally {
      setSaving(false);
    }
  };

  const toggleStatus = async (user) => {
    const active = !user.active;
    const verb = active ? "activar" : "desactivar";
    if (!window.confirm(`¿Deseas ${verb} la cuenta de ${user.name} (${user.username})?`)) return;
    setError("");
    setNotice("");
    try {
      await api(`/auth/users/${user.id}/status`, {
        method: "PATCH",
        body: JSON.stringify({ active }),
      });
      setNotice(`La cuenta “${user.username}” quedó ${active ? "activa" : "desactivada"}.`);
      await loadUsers();
    } catch (reason) {
      setError(reason.message);
    }
  };

  const roleName = (role) => ({
    super: "Super administrador",
    user_admin: "Administrador de usuarios",
    user: "Usuario",
  })[role] || role;

  return (
    <>
      <section className="card">
        <h2>Crear cuenta</h2>
        <p className="hint">Cada persona inicia sesión con su propio usuario. Las contraseñas se guardan cifradas como hash y no se pueden consultar después.</p>
        {error && <div className="message error" role="alert">{error}<button onClick={() => setError("")}>Cerrar</button></div>}
        {notice && <div className="message success" role="status">{notice}<button onClick={() => setNotice("")}>Cerrar</button></div>}
        <form className="form-grid" onSubmit={createUser}>
          <label>Usuario
            <input required minLength={3} maxLength={50} pattern="[a-zA-Z0-9._\-]+" autoComplete="off" value={form.username} onChange={(event) => setForm({ ...form, username: event.target.value })} />
          </label>
          <label>Nombre
            <input required maxLength={120} value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} />
          </label>
          <label>Contraseña inicial
            <input type="password" required minLength={12} autoComplete="new-password" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} />
          </label>
          <label>Rol
            <select value={form.role} disabled={!isSuper} onChange={(event) => setForm({ ...form, role: event.target.value })}>
              <option value="user">Usuario</option>
              {isSuper && <><option value="user_admin">Administrador de usuarios</option><option value="super">Super administrador</option></>}
            </select>
          </label>
          <button className="primary" disabled={saving}>{saving ? "Creando…" : "Crear cuenta"}</button>
        </form>
        <p className="hint">Mínimo 12 caracteres. El sistema no tiene registro público.</p>
      </section>

      <section className="card">
        <div className="users-heading">
          <div><h2>Cuentas del sistema</h2><p className="hint">Solo se muestran datos de la cuenta, nunca las contraseñas.</p></div>
          <label className="users-filter">Filtrar
            <input type="search" placeholder="Nombre, usuario o rol…" value={filter} onChange={(event) => setFilter(event.target.value)} />
          </label>
        </div>
        {loading ? <p className="muted">Cargando usuarios…</p> : filteredUsers.length ? (
          <Table headers={["Nombre", "Usuario", "Rol", "Estado", "Último acceso", "Acciones"]}>
            {filteredUsers.map((user) => (
              <tr key={user.id}>
                <td>{user.name}</td>
                <td>{user.username}</td>
                <td>{roleName(user.role)}</td>
                <td><StatusTag bad={!user.active}>{user.active ? "Activa" : "Desactivada"}</StatusTag></td>
                <td>{user.lastLoginAt ? new Date(user.lastLoginAt).toLocaleString("es-CO") : "Nunca"}</td>
                <td>
                  <button
                    disabled={user.id === currentUser.id || (!isSuper && user.role !== "user")}
                    title={user.id === currentUser.id ? "No puedes desactivar tu propia cuenta" : ""}
                    onClick={() => toggleStatus(user)}
                  >
                    {user.active ? "Desactivar" : "Activar"}
                  </button>
                </td>
              </tr>
            ))}
          </Table>
        ) : <Empty>{users.length ? "No hay cuentas que coincidan con el filtro." : "Aún no hay otras cuentas registradas."}</Empty>}
      </section>
    </>
  );
}

function Backup({ lastBackup, month, notify }) {
  const [backupMonth, setBackupMonth] = useState(month);
  const [backupError, setBackupError] = useState("");
  const makeBackup = async (selectedMonth) => {
    setBackupError("");
    try {
      const backup = await api(`/backup${selectedMonth ? `?month=${encodeURIComponent(selectedMonth)}` : ""}`);
      saveFile(`backup_diego_lechona_${selectedMonth || "completo"}_${TODAY}.json`, JSON.stringify(backup, null, 2), "application/json");
      await notify(() => Promise.resolve(), "Backup descargado.");
    } catch (reason) {
      setBackupError(reason.message);
    }
  };
  return <>
    <section className="card"><h2>Datos guardados en Neon</h2><p>Los maestros, formatos, registros, documentos y actividades se guardan directamente en la base de datos. La última copia descargada fue: <b>{lastBackup || "ninguna"}</b>.</p>
      <div className="action-row"><button className="primary" onClick={() => makeBackup("")}>Backup completo (JSON)</button><label>Backup de un mes<input type="month" value={backupMonth} onChange={(e) => setBackupMonth(e.target.value)} /></label><button onClick={() => makeBackup(backupMonth)}>Descargar mes</button></div>
      <p className="hint">La descarga es solo una copia local para consulta. No se pueden subir ni restaurar backups desde esta aplicación.</p>
      {backupError && <p className="error-text" role="alert">{backupError}</p>}
    </section>
  </>;
}
