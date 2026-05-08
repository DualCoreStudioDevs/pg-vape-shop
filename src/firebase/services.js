// src/firebase/services.js — PG VAPE SHOP
// ✅ Inventario ML con stock_botellas | ✅ Fiado estadoCobro:"pendiente" | ✅ Dashboard KPIs reales
import {
  collection, getDocs, addDoc, updateDoc, deleteDoc, doc,
  Timestamp, query, where, orderBy, runTransaction,
} from "firebase/firestore";
import { db } from "./config";

// ── 1. IMAGEN BASE64 ──────────────────────────────────────────
export function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    if (!file) { reject(new Error("No se proporcionó ningún archivo.")); return; }
    const reader = new FileReader();
    reader.onload  = () => resolve(reader.result);
    reader.onerror = ()  => reject(new Error("No se pudo leer el archivo."));
    reader.readAsDataURL(file);
  });
}

// ── 2. PRODUCTOS CRUD ─────────────────────────────────────────
export async function getProducts() {
  const snap = await getDocs(collection(db, "productos"));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}
export async function addProduct(productData) {
  const data = buildProductPayload(productData);
  data.createdAt = Timestamp.now();
  const ref = await addDoc(collection(db, "productos"), data);
  await updateDoc(ref, { id: ref.id });
  return { success: true, id: ref.id };
}
export async function updateProduct(productId, productData) {
  const data = buildProductPayload(productData);
  await updateDoc(doc(db, "productos", productId), data);
  return { success: true, id: productId };
}
export async function deleteProduct(productId) {
  await deleteDoc(doc(db, "productos", productId));
  return { success: true };
}

/**
 * buildProductPayload — Esquema del objeto producto (Firestore)
 *
 * Para Líquidos (SIEMPRE modo detallado):
 *   - precio y stock genérico = 0 (no se usan en venta)
 *   - Campos: ml_por_botella, cantidad_botellas, precio_costo_botella (costo interno)
 *   - precioPorMl = precio de venta al cliente por ml (usado en POS modo ML)
 *   - Se calcula: stock_total_ml = ml_por_botella * cantidad_botellas
 *   - stock_botellas = cantidad_botellas al crear; se sincroniza en cada venta
 *
 * Para cualquier otra categoría:
 *   - Campos normales: precio, stock
 */
function buildProductPayload(data) {
  const isLiquido = data.categoria === "Líquidos";

  const mlPorBotella         = parseFloat(data.ml_por_botella) || 0;
  const cantidadBotellas     = parseInt(data.cantidad_botellas, 10) || 0;
  const stockBotellas        = parseInt(data.stock_botellas ?? data.cantidad_botellas, 10) || 0;
  const precioCostoBotella   = parseFloat(data.precio_costo_botella || data.precioCostoBotella) || 0;
  // precio_botella = precio de VENTA al cliente por botella cerrada
  const precioBotella        = parseFloat(data.precio_botella) || 0;
  // precioPorMl = precio de venta al cliente por ml (usado en modo ML)
  const precioPorMl          = parseFloat(data.precioPorMl || data.precio_por_botella) || 0;

  // stock_total_ml siempre calculado desde botellas × ml
  const totalMlDisponibles   = isLiquido && mlPorBotella > 0 && stockBotellas > 0
    ? mlPorBotella * stockBotellas
    : (parseFloat(data.stockMl) || 0);

  return {
    nombre:           String(data.nombre || "").trim(),
    marca:            String(data.marca  || "").trim(),
    categoria:        data.categoria || "Desechables",
    precio:           isLiquido ? 0 : (parseFloat(data.precio) || 0),
    stock:            isLiquido ? 0 : (parseInt(data.stock, 10) || 0),
    descripcion:      String(data.descripcion || "").trim(),
    niveles_nicotina: Array.isArray(data.niveles_nicotina) ? data.niveles_nicotina : [],
    imageBase64:      data.imageBase64 || "",
    imageUrl:         data.imageUrl    || "",
    // Todos los líquidos usan modoLiquido: "detallado" siempre
    modoLiquido:      isLiquido ? "detallado" : "botella",
    ...(isLiquido && {
      precioPorMl,
      precio_botella:        precioBotella,        // precio de venta por botella cerrada (POS)
      precio_costo_botella:  precioCostoBotella,   // costo interno de compra
      ml_por_botella:        mlPorBotella,
      stock_botellas:        stockBotellas,
      stock_total_ml:        totalMlDisponibles,
      total_ml_disponibles:  totalMlDisponibles,
      stockMl:               totalMlDisponibles,  // alias retrocompat.
      cantidad_botellas:     cantidadBotellas,
    }),
    updatedAt: Timestamp.now(),
  };
}

// ── 3. VENTA ATÓMICA — con ML sync + Fiado ───────────────────
/**
 * completeSale (handleSale)
 *
 * LÓGICA DE INVENTARIO LÍQUIDO:
 *  A) Venta de BOTELLA COMPLETA (esLiquidoBotella: true):
 *     stock_botellas       -= qty
 *     total_ml_disponibles -= ml_por_botella × qty
 *     stockMl              = total_ml_disponibles (sync)
 *
 *  B) Venta de ML DETALLADO (esLiquidoDetallado: true):
 *     total_ml_disponibles -= mlAmount
 *     stockMl              = total_ml_disponibles (sync)
 *     stock_botellas       = Math.floor(total_ml_disponibles / ml_por_botella)  ← AUTO-SYNC
 *
 * LÓGICA DE FIADO:
 *  - metodo === "fiado"  → estadoCobro: "pendiente"  (NO suma en KPIs de ingreso real)
 *  - cualquier otro      → estadoCobro: "cobrado"    (SÍ suma en KPIs)
 *  - marcarFiadoCobrado() cambia "pendiente" → "cobrado" cuando se recibe el pago
 */
export async function completeSale(cartItems, total, paymentMethod, cajero = null, fiadoInfo = null) {
  const esVentaFiada = paymentMethod === "fiado";

  const saleData = {
    items: cartItems.map((item) => {
      if (item.esLiquidoDetallado) {
        return {
          productId: item.id, productName: item.nombre, marca: item.marca || "",
          esLiquidoDetallado: true, mlAmount: item.mlAmount,
          precioPorMl: item.precioPorMl, montoRD: item.montoRD, subtotal: item.montoRD,
        };
      }
      return {
        productId: item.id, productName: item.nombre, marca: item.marca || "",
        nicotina: item.nicotina || null, quantity: item.qty, unitPrice: item.precio,
        subtotal: item.precio * item.qty,
        esLiquidoBotella: item.esLiquidoBotella || false,
      };
    }),
    total,
    metodoPago:      paymentMethod,
    metodo:          paymentMethod,
    fecha:           Timestamp.now(),
    fechaISO:        new Date().toISOString(),
    cajero,
    esVentaFiada,
    // ✅ FIX: Fiado siempre guarda estadoCobro:"pendiente"
    estadoCobro:     esVentaFiada ? "pendiente" : "cobrado",
    clienteNombre:   esVentaFiada ? (fiadoInfo?.nombre   || "") : null,
    clienteTelefono: esVentaFiada ? (fiadoInfo?.telefono || "") : null,
    fechaCobro:      null,
  };

  let ventaId = "";

  await runTransaction(db, async (transaction) => {
    // FASE 1: leer todos los documentos necesarios
    const refs  = {};
    const datos = {};
    for (const item of cartItems) {
      const pid = item.id;
      if (refs[pid]) continue;
      const ref  = doc(db, "productos", pid);
      const snap = await transaction.get(ref);
      if (!snap.exists()) throw new Error(`Producto no encontrado: ${pid}`);
      refs[pid]  = ref;
      datos[pid] = snap.data();
    }

    // FASE 2: validar stock antes de escribir
    for (const item of cartItems) {
      const producto = datos[item.id];

      if (item.esLiquidoDetallado) {
        const mlDisponibles = producto.total_ml_disponibles ?? producto.stockMl ?? 0;
        if (mlDisponibles < item.mlAmount) throw new Error(
          `Stock ML insuficiente para "${item.nombre}". Disponible: ${mlDisponibles}ml, requerido: ${item.mlAmount}ml.`
        );
      } else if (item.esLiquidoBotella) {
        const botellas = producto.stock_botellas ?? producto.stock ?? 0;
        if (botellas < item.qty) throw new Error(
          `Botellas insuficientes para "${item.nombre}". Disponibles: ${botellas}, requeridas: ${item.qty}.`
        );
      } else {
        const disponible = producto.stock || 0;
        if (disponible < item.qty) throw new Error(
          `Stock insuficiente para "${item.nombre}". Disponible: ${disponible}, requerido: ${item.qty}.`
        );
      }
    }

    // FASE 3: aplicar descuentos de stock
    for (const item of cartItems) {
      const pid      = item.id;
      const producto = datos[pid];

      if (item.esLiquidoDetallado) {
        // B) ML detallado — ✅ AUTO-SYNC stock_botellas
        const mlActual  = producto.total_ml_disponibles ?? producto.stockMl ?? 0;
        const mlNuevo   = Math.max(0, mlActual - item.mlAmount);
        const mlPorBot  = producto.ml_por_botella || 0;
        // ✅ FIX: Auto-sincronización de botellas usando Math.floor
        const botellasSinc = mlPorBot > 0
          ? Math.floor(mlNuevo / mlPorBot)
          : (producto.stock_botellas ?? 0);

        transaction.update(refs[pid], {
          total_ml_disponibles: mlNuevo,
          stock_total_ml:       mlNuevo,
          stockMl:              mlNuevo,
          stock_botellas:       botellasSinc,
          updatedAt:            Timestamp.now(),
        });

      } else if (item.esLiquidoBotella) {
        // A) Botella completa
        const botellaActual  = producto.stock_botellas ?? producto.stock ?? 0;
        const botellasMenos  = Math.max(0, botellaActual - item.qty);
        const mlPorBot       = producto.ml_por_botella || 0;
        const mlActual       = producto.total_ml_disponibles ?? producto.stockMl ?? 0;
        const mlNuevo        = Math.max(0, mlActual - mlPorBot * item.qty);

        transaction.update(refs[pid], {
          stock_botellas:       botellasMenos,
          total_ml_disponibles: mlNuevo,
          stock_total_ml:       mlNuevo,
          stockMl:              mlNuevo,
          stock:                botellasMenos,
          updatedAt:            Timestamp.now(),
        });

      } else {
        // Producto normal
        transaction.update(refs[pid], {
          stock:     Math.max(0, (producto.stock || 0) - item.qty),
          updatedAt: Timestamp.now(),
        });
      }
    }

    // Guardar la venta
    const ventaRef = doc(collection(db, "ventas"));
    ventaId = ventaRef.id;
    transaction.set(ventaRef, { ...saleData, id: ventaRef.id });
  });

  return { success: true, ventaId };
}

// ── 4. FIADO — Cuentas por Cobrar ────────────────────────────
/**
 * ✅ FIX: Filtra correctamente con where("estadoCobro", "==", "pendiente")
 * Requiere índice compuesto en Firestore: estadoCobro ASC + fecha DESC
 */
export async function getVentasFiadoPendientes() {
  const q = query(
    collection(db, "ventas"),
    where("estadoCobro", "==", "pendiente"),
    orderBy("fecha", "desc")
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

/** Cambia estadoCobro "pendiente" → "cobrado": a partir de aquí entra en KPIs */
export async function marcarFiadoCobrado(ventaId) {
  await updateDoc(doc(db, "ventas", ventaId), {
    estadoCobro: "cobrado",
    fechaCobro:  Timestamp.now(),
  });
  return { success: true };
}

// ── 5. ESTADÍSTICAS ───────────────────────────────────────────
const startOfDay   = (d = new Date()) => { const x=new Date(d); x.setHours(0,0,0,0); return x; };
const endOfDay     = (d = new Date()) => { const x=new Date(d); x.setHours(23,59,59,999); return x; };
const startOfWeek  = (d = new Date()) => {
  const x=new Date(d); const day=x.getDay(); x.setDate(x.getDate()+(day===0?-6:1-day)); x.setHours(0,0,0,0); return x;
};
const startOfMonth = (d = new Date()) => new Date(d.getFullYear(), d.getMonth(), 1, 0,0,0,0);
const endOfMonth   = (d = new Date()) => new Date(d.getFullYear(), d.getMonth()+1, 0, 23,59,59,999);

async function queryVentas(desde, hasta) {
  const q = query(
    collection(db, "ventas"),
    where("fecha", ">=", Timestamp.fromDate(desde)),
    where("fecha", "<=", Timestamp.fromDate(hasta)),
    orderBy("fecha", "desc")
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function getSalesToday()      { return queryVentas(startOfDay(),   endOfDay()); }
export async function getSalesThisWeek()   { return queryVentas(startOfWeek(),  endOfDay()); }
export async function getSalesThisMonth()  { return queryVentas(startOfMonth(), endOfMonth()); }
export async function getSalesByDate(date) { return queryVentas(startOfDay(date), endOfDay(date)); }

/**
 * sumSales — KPI central del Dashboard
 * ✅ FIX Dashboard: Total Ventas suma TODO; Ingreso Real excluye "pendiente"
 *
 * Con { soloReales: true }: EXCLUYE ventas donde estadoCobro === "pendiente"
 * Con { soloReales: false } (default): suma absolutamente todo (incluye fiados)
 */
export function sumSales(sales = [], { soloReales = false } = {}) {
  return sales.reduce((acc, v) => {
    if (soloReales && v.estadoCobro === "pendiente") return acc;
    return acc + (Number(v.total) || 0);
  }, 0);
}

/** sumRealIncome — siempre excluye pendientes (ingresos efectivamente cobrados) */
export function sumRealIncome(sales = []) {
  return sumSales(sales, { soloReales: true });
}

/** sumTotalVentas — suma TODO incluyendo fiados pendientes (para el KPI "Total Ventas") */
export function sumTotalVentas(sales = []) {
  return sumSales(sales, { soloReales: false });
}

/** groupSalesByDay — para la gráfica de barras: solo ingresos reales */
export function groupSalesByDay(sales = []) {
  const map = {};
  for (const v of sales) {
    if (v.estadoCobro === "pendiente") continue;
    const key = v.fechaISO?.slice(0,10)
      ?? v.fecha?.toDate?.()?.toISOString().slice(0,10)
      ?? "sin-fecha";
    if (!map[key]) map[key] = { total: 0, count: 0 };
    map[key].total += Number(v.total) || 0;
    map[key].count += 1;
  }
  return Object.entries(map)
    .sort(([a],[b]) => a.localeCompare(b))
    .map(([fecha,{total,count}]) => ({ fecha, total, count }));
}

export function salesByMethod(sales = []) {
  const r = { efectivo: 0, tarjeta: 0, transferencia: 0, fiado: 0 };
  for (const v of sales) {
    const m = v.metodoPago || v.metodo;
    if (m in r) r[m] += Number(v.total) || 0;
  }
  return { ...r, total: r.efectivo + r.tarjeta + r.transferencia + r.fiado };
}

export function getTopProducts(sales = [], limit = 8) {
  const map = {};
  for (const v of sales) {
    if (v.estadoCobro === "pendiente") continue;  // no contar fiados pendientes
    for (const item of v.items || []) {
      const pid = item.productId;
      if (!map[pid]) map[pid] = {
        productId: pid, productName: item.productName||"",
        marca: item.marca||"", totalQty: 0, totalML: 0, totalRD: 0,
      };
      if (item.esLiquidoDetallado) {
        map[pid].totalML += Number(item.mlAmount)||0;
        map[pid].totalRD += Number(item.montoRD)||0;
      } else {
        map[pid].totalQty += Number(item.quantity)||0;
        map[pid].totalRD  += Number(item.subtotal)||0;
      }
    }
  }
  return Object.values(map).sort((a,b) => b.totalRD - a.totalRD).slice(0, limit);
}

export async function getDailySummary() {
  const sales = await getSalesToday();
  const m = salesByMethod(sales);
  return {
    sales,
    totalEfectivo:      m.efectivo,
    totalTarjeta:       m.tarjeta,
    totalTransferencia: m.transferencia,
    totalFiado:         m.fiado,
    grandTotal:         m.total,           // TODO: suma incluyendo fiados (para "Total Ventas")
    grandTotalReal:     sumRealIncome(sales), // Solo cobrado (para "Ingreso Real")
    count:              sales.length,
  };
}
