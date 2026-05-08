// src/firebase/services.js — PG VAPE SHOP
// ✅ Inventario ML con stock_botellas | ✅ Fiado | ✅ Dashboard KPIs reales
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
 * Campos comunes:
 *   nombre, marca, categoria, precio, stock, descripcion,
 *   niveles_nicotina[], imageBase64, imageUrl, modoLiquido,
 *   createdAt, updatedAt
 *
 * Campos adicionales SOLO para Líquidos modo "detallado":
 *   precioPorMl           — precio por mililitro (RD$)
 *   ml_por_botella        — ML que contiene cada botella física (int)
 *   stock_botellas        — botellas COMPLETAS en existencia (int)
 *   total_ml_disponibles  — ml_por_botella × stock_botellas (se recalcula en ventas)
 *   stockMl               — alias de total_ml_disponibles (retrocompatibilidad UI)
 */
function buildProductPayload(data) {
  const isLiquidoDetallado = data.categoria === "Líquidos" && data.modoLiquido === "detallado";

  const mlPorBotella     = parseFloat(data.ml_por_botella) || 0;
  const cantidadBotellas = parseInt(data.cantidad_botellas, 10) || 0;
  const stockBotellas    = parseInt(data.stock_botellas ?? data.cantidad_botellas, 10) || 0;

  // total_ml_disponibles se calcula desde botellas cuando ambos campos están presentes
  let totalMlDisponibles = parseFloat(data.stockMl) || 0;
  if (isLiquidoDetallado && mlPorBotella > 0 && stockBotellas > 0) {
    totalMlDisponibles = mlPorBotella * stockBotellas;
  }

  return {
    nombre:           String(data.nombre || "").trim(),
    marca:            String(data.marca  || "").trim(),
    categoria:        data.categoria || "Desechables",
    precio:           parseFloat(data.precio)  || 0,
    stock:            parseInt(data.stock, 10)  || 0,
    descripcion:      String(data.descripcion || "").trim(),
    niveles_nicotina: Array.isArray(data.niveles_nicotina) ? data.niveles_nicotina : [],
    imageBase64:      data.imageBase64 || "",
    imageUrl:         data.imageUrl    || "",
    modoLiquido:      data.categoria === "Líquidos" ? (data.modoLiquido || "botella") : "botella",
    ...(isLiquidoDetallado && {
      precioPorMl:          parseFloat(data.precioPorMl)  || 0,
      ml_por_botella:       mlPorBotella,
      stock_botellas:       stockBotellas,
      total_ml_disponibles: totalMlDisponibles,
      stockMl:              totalMlDisponibles,  // alias retrocompat.
      cantidad_botellas:    cantidadBotellas,
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
 *     stock_botellas       = Math.floor(total_ml_disponibles / ml_por_botella)
 *
 * LÓGICA DE FIADO:
 *  - metodo === "fiado"  → estadoCobro: "pendiente"  (NO suma en KPIs)
 *  - cualquier otro      → estadoCobro: "cobrado"    (SÍ suma en KPIs)
 *  - marcarFiadoCobrado() cambia "pendiente" → "cobrado"
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
        // B) ML detallado
        const mlActual  = producto.total_ml_disponibles ?? producto.stockMl ?? 0;
        const mlNuevo   = Math.max(0, mlActual - item.mlAmount);
        const mlPorBot  = producto.ml_por_botella || 0;
        const botellasSinc = mlPorBot > 0
          ? Math.floor(mlNuevo / mlPorBot)
          : (producto.stock_botellas ?? 0);

        transaction.update(refs[pid], {
          total_ml_disponibles: mlNuevo,
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
/** Filtra ventas con estadoCobro === "pendiente" */
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
 * Con { soloReales: true }: EXCLUYE ventas donde estadoCobro === "pendiente"
 * Solo suma ventas "cobradas" → fiado cobra SOLO cuando marcarFiadoCobrado()
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
    grandTotal:         m.total,
    grandTotalReal:     sumRealIncome(sales),
    count:              sales.length,
  };
}
