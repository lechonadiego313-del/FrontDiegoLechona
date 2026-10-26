import { useCallback, useEffect, useMemo, useState } from "react";

const money = (value) => new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(Number(value || 0));
const newKey = () => `${Date.now()}_${crypto.randomUUID().replaceAll("-", "")}`;

export default function DispatchControl({ api, currentUser, setError, setNotice }) {
  const [tab, setTab] = useState("dispatch");
  const [products, setProducts] = useState([]);
  const [refresh, setRefresh] = useState(0);
  const canManageFinancials = currentUser?.role === "super";
  useEffect(() => {
    api(`/dispatch-products${canManageFinancials ? "?includeInactive=true" : ""}`).then(setProducts).catch((reason) => setError(reason.message));
  }, [api, canManageFinancials, refresh, setError]);
  const done = (message) => { setNotice(message); setRefresh((value) => value + 1); };
  return <div className="dispatch-module">
    <div className="tabs no-print">
      {[['dispatch', 'Despacho'], ['history', 'Historial'], ...(canManageFinancials ? [['analytics', 'Indicadores'], ['products', 'Productos']] : [])].map(([id, label]) =>
        <button key={id} className={tab === id ? "selected" : ""} onClick={() => setTab(id)}>{label}</button>)}
    </div>
    {tab === "dispatch" && <DispatchDesk api={api} products={products.filter((item) => item.active)} setError={setError} done={done} />}
    {tab === "history" && <DispatchHistory api={api} canCancel={canManageFinancials} refresh={refresh} setError={setError} done={done} />}
    {tab === "analytics" && canManageFinancials && <DispatchAnalytics api={api} setError={setError} />}
    {tab === "products" && canManageFinancials && <DispatchProducts api={api} products={products} setError={setError} done={done} />}
  </div>;
}

function DispatchDesk({ api, products, setError, done }) {
  const [saleType, setSaleType] = useState("retail");
  const [customerName, setCustomerName] = useState("");
  const [cart, setCart] = useState([]);
  const price = (presentation) => saleType === "wholesale" && Number(presentation.wholesalePrice) > 0 ? presentation.wholesalePrice : presentation.retailPrice;
  const total = cart.reduce((sum, item) => sum + Number(price(item.presentation)) * item.quantity, 0);
  const add = (product, presentation) => setCart((rows) => {
    const found = rows.find((row) => row.presentation.id === presentation.id);
    return found ? rows.map((row) => row === found ? { ...row, quantity: row.quantity + 1 } : row) : [...rows, { product, presentation, quantity: 1 }];
  });
  const quantity = (id, value) => setCart((rows) => rows.map((row) => row.presentation.id === id ? { ...row, quantity: Math.max(0, Number.parseInt(value, 10) || 0) } : row).filter((row) => row.quantity));
  const register = async (print) => {
    if (!cart.length) return setError("Agrega al menos un producto al pedido.");
    setError("");
    try {
      const record = await api("/dispatches", { method: "POST", body: JSON.stringify({ idempotencyKey: newKey(), customerName, saleType, items: cart.map((item) => ({ presentationId: item.presentation.id, quantity: item.quantity })) }) });
      setCart([]); setCustomerName(""); done(`Salida ${record.dispatchNumber} registrada.`);
      if (print) printReceipt(record);
    } catch (reason) { setError(reason.message); }
  };
  return <div className="dispatch-grid">
    <section className="card"><div className="section-heading"><div><h2>Agregar al pedido</h2><p>Los precios se validan nuevamente en el servidor.</p></div><div className="segmented"><button className={saleType === "retail" ? "selected" : ""} onClick={() => setSaleType("retail")}>Al detal</button><button className={saleType === "wholesale" ? "selected" : ""} onClick={() => setSaleType("wholesale")}>Al mayor</button></div></div>
      {products.length ? products.map((product) => <div className="catalog-product" key={product.id}><h3>{product.name}</h3><div className="presentation-grid">{product.presentations.filter((item) => item.active).map((presentation) => <button key={presentation.id} onClick={() => add(product, presentation)}><strong>{presentation.name}</strong><span>{money(price(presentation))}</span></button>)}</div></div>) : <p className="empty">No hay productos comerciales activos.</p>}
    </section>
    <section className="card order-card"><h2>Pedido actual</h2><label>Cliente (opcional)<input value={customerName} maxLength="160" onChange={(event) => setCustomerName(event.target.value)} placeholder="Mostrador" /></label>
      <div className="cart-list">{cart.length ? cart.map((item) => <div className="cart-row" key={item.presentation.id}><div><strong>{item.product.name}</strong><small>{item.presentation.name} · {money(price(item.presentation))}</small></div><div className="quantity"><button onClick={() => quantity(item.presentation.id, item.quantity - 1)}>−</button><input aria-label={`Cantidad de ${item.product.name}`} type="number" min="0" max="10000" value={item.quantity} onChange={(event) => quantity(item.presentation.id, event.target.value)} /><button onClick={() => quantity(item.presentation.id, item.quantity + 1)}>+</button></div><b>{money(Number(price(item.presentation)) * item.quantity)}</b></div>) : <p className="empty">Selecciona una presentación para agregarla.</p>}</div>
      <div className="order-total">Total <strong>{money(total)}</strong></div><div className="order-actions no-print"><button className="primary" onClick={() => register(false)}>Registrar salida</button><button onClick={() => register(true)}>Registrar e imprimir</button><button className="danger-button" onClick={() => setCart([])}>Vaciar</button></div>
    </section>
  </div>;
}

function DispatchHistory({ api, canCancel, refresh, setError, done }) {
  const [result, setResult] = useState({ rows: [], pagination: { page: 1, pages: 0 } });
  const [page, setPage] = useState(1); const [search, setSearch] = useState(""); const [from, setFrom] = useState(""); const [to, setTo] = useState("");
  const load = useCallback(() => api(`/dispatches?page=${page}&limit=20&search=${encodeURIComponent(search)}&from=${from}&to=${to}`).then(setResult).catch((reason) => setError(reason.message)), [api, page, search, from, to, refresh, setError]);
  useEffect(() => { load(); }, [load]);
  const cancel = async (id) => { const reason = window.prompt("Motivo de anulación (mínimo 5 caracteres):"); if (!reason) return; try { await api(`/dispatches/${id}/cancel`, { method: "POST", body: JSON.stringify({ reason }) }); done("Salida anulada con trazabilidad."); load(); } catch (error) { setError(error.message); } };
  return <section className="card"><div className="section-heading"><div><h2>Historial de salidas</h2><p>Las salidas anuladas permanecen disponibles para auditoría.</p></div></div><div className="history-filters no-print"><label>Buscar<input value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} placeholder="Número o cliente" /></label><label>Desde<input type="date" value={from} onChange={(event) => setFrom(event.target.value)} /></label><label>Hasta (exclusiva)<input type="date" value={to} onChange={(event) => setTo(event.target.value)} /></label></div>
    <div className="dispatch-history">{result.rows.map((record) => <article className={`history-record ${record.status === "cancelled" ? "cancelled" : ""}`} key={record.id}><div><strong>{record.dispatchNumber}</strong><span>{new Date(record.createdAt).toLocaleString("es-CO")} · {record.customerName || "Mostrador"} · {record.saleType === "wholesale" ? "Mayor" : "Detal"}</span><small>{record.items.map((item) => `${item.quantity}× ${item.productNameSnapshot} ${item.presentationNameSnapshot}`).join(", ")}</small>{record.status === "cancelled" && <em>Anulada: {record.cancellationReason}</em>}</div><b>{money(record.totalAmount)}</b><div className="no-print"><button onClick={() => printReceipt(record)}>Imprimir</button>{canCancel && record.status === "confirmed" && <button className="danger-button" onClick={() => cancel(record.id)}>Anular</button>}</div></article>)}</div>
    {!result.rows.length && <p className="empty">No hay salidas para los filtros actuales.</p>}<div className="pagination no-print"><span>Página {page} de {result.pagination.pages || 1}</span><div><button disabled={page <= 1} onClick={() => setPage(page - 1)}>Anterior</button><button disabled={page >= result.pagination.pages} onClick={() => setPage(page + 1)}>Siguiente</button></div></div>
  </section>;
}

function DispatchAnalytics({ api, setError }) {
  const [period, setPeriod] = useState("month"); const [reference, setReference] = useState(new Date().toISOString().slice(0, 10)); const [data, setData] = useState(null);
  useEffect(() => { api(`/dispatch-analytics/summary?period=${period}&reference=${reference}`).then(setData).catch((reason) => setError(reason.message)); }, [api, period, reference, setError]);
  if (!data) return <section className="card">Cargando indicadores…</section>;
  const max = Math.max(...data.sales.map((item) => Number(item.value)), 1);
  return <><div className="analytics-controls no-print"><div className="segmented">{[['day','Día'],['week','Semana'],['month','Mes'],['year','Año']].map(([id,label]) => <button key={id} className={period === id ? "selected" : ""} onClick={() => setPeriod(id)}>{label}</button>)}</div><input type="date" value={reference} onChange={(event) => setReference(event.target.value)} /></div><div className="stats-grid">{[['Ventas',money(data.summary.sales)],['Costo total',money(data.summary.costs)],['Ganancia',money(data.summary.profit)],['Margen',`${data.summary.margin}%`],['Unidades',data.summary.units],['Pedidos',data.summary.orders],['Ticket promedio',money(data.summary.averageTicket)]].map(([label,value]) => <div className="stat" key={label}><strong>{value}</strong><span>{label}</span></div>)}</div><div className="dispatch-grid"><section className="card"><h2>Ventas en el periodo</h2><div className="sales-bars">{data.sales.map((item) => <div key={item.date}><i style={{ height: `${Number(item.value) / max * 100}%` }} title={money(item.value)} /><span>{item.date.slice(5)}</span></div>)}</div></section><section className="card"><h2>Participación por producto</h2>{data.products.map((item) => <div className="share-row" key={`${item.productName}-${item.presentationName}`}><span>{item.productName} · {item.presentationName} ({item.share}%)</span><i style={{ width: `${item.share}%` }} /></div>)}</section></div><section className="card"><h2>Detalle por producto y presentación</h2><div className="table-wrap"><table><thead><tr><th>Producto</th><th>Unidades</th><th>Ventas</th><th>Costo</th><th>Ganancia</th><th>Margen</th><th>Participación</th></tr></thead><tbody>{data.products.map((item) => <tr key={`${item.productName}-${item.presentationName}`}><td>{item.productName} · {item.presentationName}</td><td>{item.quantity}</td><td>{money(item.sales)}</td><td>{money(item.costs)}</td><td>{money(item.profit)}</td><td>{item.margin}%</td><td>{item.share}%</td></tr>)}</tbody></table></div></section></>;
}

function DispatchProducts({ api, products, setError, done }) {
  const [modal, setModal] = useState(null);
  const [search, setSearch] = useState("");
  const filtered = products.filter((product) => product.name.toLocaleLowerCase("es").includes(search.toLocaleLowerCase("es")));
  const remove = async (product) => {
    if (!window.confirm(`¿Desactivar ${product.name}? El historial de salidas se conservará.`)) return;
    try { await api(`/dispatch-products/${product.id}`, { method: "DELETE" }); done("Producto desactivado correctamente."); }
    catch (error) { setError(error.message); }
  };
  return <section className="card"><div className="section-heading"><div><h2>Maestro de productos comerciales</h2><p>Crea y edita productos con sus presentaciones. El historial conserva sus valores originales.</p></div><button className="primary" onClick={() => setModal({ product: null, readOnly: false })}>+ Nuevo producto</button></div>
    <div className="commercial-toolbar"><label>Buscar producto<input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Nombre del producto" /></label><span>{filtered.length} producto{filtered.length === 1 ? "" : "s"}</span></div>
    <div className="table-wrap"><table><thead><tr><th>Producto</th><th>Indirectos</th><th>Presentaciones</th><th>Estado</th><th>Acciones</th></tr></thead><tbody>{filtered.map((product) => <tr key={product.id}><td className="master-value">{product.name}</td><td>{Number(product.indirectPercentage)}%</td><td>{product.presentations.length}</td><td><span className={`tag ${product.active ? "good" : "bad"}`}>{product.active ? "Activo" : "Inactivo"}</span></td><td className="action-cell"><button onClick={() => setModal({ product, readOnly: true })}>Ver</button><button onClick={() => setModal({ product, readOnly: false })}>Editar</button>{product.active && <button className="danger-button" onClick={() => remove(product)}>Desactivar</button>}</td></tr>)}</tbody></table></div>
    {!filtered.length && <p className="empty">No hay productos que coincidan con la búsqueda.</p>}
    {modal && <ProductModal product={modal.product} readOnly={modal.readOnly} api={api} onClose={() => setModal(null)} setError={setError} done={(message) => { setModal(null); done(message); }} />}
  </section>;
}

function ProductModal({ product, readOnly, api, onClose, setError, done }) {
  const [draft, setDraft] = useState(() => product ? { ...product, presentations: product.presentations.map((item) => ({ ...item })) } : { name: "", indirectPercentage: 22, active: true, presentations: [{ _key: crypto.randomUUID(), name: "Unidad", productionCost: 0, retailPrice: 0, wholesalePrice: 0, active: true }] });
  const [saving, setSaving] = useState(false); const [feedback, setFeedback] = useState("");
  useEffect(() => { const close = (event) => event.key === "Escape" && !saving && onClose(); window.addEventListener("keydown", close); return () => window.removeEventListener("keydown", close); }, [onClose, saving]);
  const updatePresentation = (index, values) => setDraft((current) => ({ ...current, presentations: current.presentations.map((item, itemIndex) => itemIndex === index ? { ...item, ...values } : item) }));
  const removePresentation = (index) => setDraft((current) => ({ ...current, presentations: current.presentations.map((item, itemIndex) => itemIndex === index ? { ...item, _deleted: true } : item) }));
  const save = async (event) => {
    event.preventDefault(); setFeedback(""); setError("");
    const activeRows = draft.presentations.filter((item) => !item._deleted);
    if (!draft.name.trim()) return setFeedback("El nombre del producto es obligatorio.");
    if (!activeRows.length) return setFeedback("Agrega al menos una presentación.");
    if (activeRows.some((item) => !item.name.trim() || Number(item.retailPrice) <= 0 || Number(item.productionCost) < 0 || Number(item.wholesalePrice) < 0)) return setFeedback("Revisa nombres, costos y precios de las presentaciones.");
    setSaving(true);
    try {
      if (!product) {
        await api("/dispatch-products", { method: "POST", body: JSON.stringify({ ...draft, presentations: activeRows }) });
      } else {
        await api(`/dispatch-products/${product.id}`, { method: "PUT", body: JSON.stringify(draft) });
        for (const item of draft.presentations) {
          if (item._deleted && item.id) await api(`/dispatch-presentations/${item.id}`, { method: "DELETE" });
          else if (!item._deleted && item.id) await api(`/dispatch-presentations/${item.id}`, { method: "PUT", body: JSON.stringify(item) });
          else if (!item._deleted) await api(`/dispatch-products/${product.id}/presentations`, { method: "POST", body: JSON.stringify(item) });
        }
      }
      done(product ? "Producto y presentaciones actualizados correctamente." : "Producto y presentaciones creados correctamente.");
    } catch (error) { setFeedback(error.message); setError(error.message); }
    finally { setSaving(false); }
  };
  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && !saving && onClose()}><section className="product-modal" role="dialog" aria-modal="true" aria-labelledby="product-modal-title"><form onSubmit={save}><header><div><span className="eyebrow">CATÁLOGO COMERCIAL</span><h2 id="product-modal-title">{readOnly ? "Detalle del producto" : product ? "Editar producto" : "Nuevo producto"}</h2></div><button type="button" className="modal-close" onClick={onClose} disabled={saving} aria-label="Cerrar">×</button></header><div className="modal-body"><fieldset disabled={readOnly} className="modal-fieldset"><div className="product-main-fields"><label>Nombre del producto<input autoFocus={!readOnly} value={draft.name} maxLength="160" onChange={(event) => setDraft({ ...draft, name: event.target.value })} /></label><label>Costos indirectos %<input type="number" min="0" max="1000" step="0.01" value={draft.indirectPercentage} onChange={(event) => setDraft({ ...draft, indirectPercentage: event.target.value })} /></label><label>Estado<select value={draft.active ? "active" : "inactive"} onChange={(event) => setDraft({ ...draft, active: event.target.value === "active" })}><option value="active">Activo</option><option value="inactive">Inactivo</option></select></label></div><div className="modal-section-heading"><div><h3>Presentaciones</h3><p>{readOnly ? "Costos, precios y rentabilidad configurada." : "Configura costos y precios para cada tamaño o formato comercial."}</p></div>{!readOnly && <button type="button" onClick={() => setDraft({ ...draft, presentations: [...draft.presentations, { _key: crypto.randomUUID(), name: "", productionCost: 0, retailPrice: 0, wholesalePrice: 0, active: true }] })}>+ Agregar presentación</button>}</div><div className="modal-presentations">{draft.presentations.map((item, index) => !item._deleted && <PresentationFields key={item.id || item._key} item={item} indirectPercentage={draft.indirectPercentage} readOnly={readOnly} onChange={(values) => updatePresentation(index, values)} onRemove={() => removePresentation(index)} />)}</div></fieldset>{feedback && <div className="save-feedback error" role="alert">! {feedback}</div>}</div><footer><button type="button" onClick={onClose} disabled={saving}>{readOnly ? "Cerrar" : "Cancelar"}</button>{!readOnly && <button className="primary" type="submit" disabled={saving}>{saving ? "Guardando…" : product ? "Guardar cambios" : "Crear producto"}</button>}</footer></form></section></div>;
}

function PresentationFields({ item, indirectPercentage, readOnly, onChange, onRemove }) {
  const totalCost = Number(item.productionCost || 0) * (1 + Number(indirectPercentage || 0) / 100);
  const margin = (price) => Number(price) > 0 ? `${((Number(price) - totalCost) / Number(price) * 100).toFixed(1)}%` : "—";
  return <article className="modal-presentation"><div className="presentation-fields"><label>Presentación<input value={item.name} maxLength="120" onChange={(event) => onChange({ name: event.target.value })} placeholder="Ej. 20 cm" /></label><label>Costo producción<input type="number" min="0" step="0.01" value={item.productionCost} onChange={(event) => onChange({ productionCost: event.target.value })} /></label><label>Precio detal<input type="number" min="0" step="0.01" value={item.retailPrice} onChange={(event) => onChange({ retailPrice: event.target.value })} /></label><label>Precio mayor<input type="number" min="0" step="0.01" value={item.wholesalePrice} onChange={(event) => onChange({ wholesalePrice: event.target.value })} /></label><label>Estado<select value={item.active ? "active" : "inactive"} onChange={(event) => onChange({ active: event.target.value === "active" })}><option value="active">Activa</option><option value="inactive">Inactiva</option></select></label>{!readOnly && <button type="button" className="danger-button" onClick={onRemove}>Quitar</button>}</div><small>Costo total: {money(totalCost)} · Margen detal: {margin(item.retailPrice)} · Margen mayor: {Number(item.wholesalePrice) > 0 ? margin(item.wholesalePrice) : "usa precio detal"}</small></article>;
}

function printReceipt(record) {
  const popup = window.open("", "_blank", "width=440,height=700"); if (!popup) return;
  const safe = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[character]));
  popup.document.write(`<!doctype html><html><head><title>${safe(record.dispatchNumber)}</title><style>body{font:14px sans-serif;padding:20px}table{width:100%}td:last-child{text-align:right}h1,p{text-align:center}</style></head><body><h1>DIEGO LECHONA</h1><p>${safe(record.dispatchNumber)}<br>${new Date(record.createdAt).toLocaleString("es-CO")}<br>${safe(record.customerName || "Mostrador")}</p><hr><table>${record.items.map((item) => `<tr><td>${item.quantity} × ${safe(item.productNameSnapshot)} ${safe(item.presentationNameSnapshot)}</td><td>${money(item.subtotal)}</td></tr>`).join("")}</table><hr><h2 style="text-align:right">TOTAL ${money(record.totalAmount)}</h2></body></html>`); popup.document.close(); popup.focus(); setTimeout(() => popup.print(), 150);
}
