// src/firebase/services.js — PG VAPE SHOP (actualizado con Fiado + stats por fecha)
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
function buildProductPayload(data) {
  const isLiquidoDetallado = data.categoria === "Líquidos" && data.modoLiquido === "detallado";
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
      precioPorMl: parseFloat(data.precioPorMl) || 0,
      stockMl:     parseFloat(data.stockMl)     || 0,  // siempre en ML
    }),
    updatedAt: Timestamp.now(),
  };
}

// ── 3. VENTA ATÓMICA (con soporte Fiado) ──────────────────────
export async function completeSale(cartItems, total, paymentMethod, cajero = null, fiadoInfo = null) {
  const esVentaFiada = paymentMethod === "fiado";
  const saleData = {
    items: cartItems.map((item) => {
      if (item.esLiquidoDetallado) {
        return { productId: item.id, productName: item.nombre, marca: item.marca || "",
          esLiquidoDetallado: true, mlAmount: item.mlAmount, precioPorMl: item.precioPorMl,
          montoRD: item.montoRD, subtotal: item.montoRD };
      }
      return { productId: item.id, productName: item.nombre, marca: item.marca || "",
        nicotina: item.nicotina || null, quantity: item.qty, unitPrice: item.precio,
        subtotal: item.precio * item.qty };
    }),
    total,
    metodoPago:      paymentMethod,
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
    const refs = {}; const datos = {};
    for (const item of cartItems) {
      const pid = item.id;
      if (refs[pid]) continue;
      const ref  = doc(db, "productos", pid);
      const snap = await transaction.get(ref);
      if (!snap.exists()) throw new Error(`Producto no encontrado: ${pid}`);
      refs[pid] = ref; datos[pid] = snap.data();
      const producto = datos[pid];
      if (item.esLiquidoDetallado) {
        const disponible = producto.stockMl || 0;
        if (disponible < item.mlAmount) throw new Error(
          `Stock ML insuficiente para "${item.nombre}". Disponible: ${disponible}ml, requerido: ${item.mlAmount}ml.`);
      } else {
        const disponible = producto.stock || 0;
        if (disponible < item.qty) throw new Error(
          `Stock insuficiente para "${item.nombre}". Disponible: ${disponible}, requerido: ${item.qty}.`);
      }
    }
    for (const item of cartItems) {
      const pid = item.id; const producto = datos[pid];
      if (item.esLiquidoDetallado) {
        transaction.update(refs[pid], { stockMl: Math.max(0, (producto.stockMl || 0) - item.mlAmount), updatedAt: Timestamp.now() });
      } else {
        transaction.update(refs[pid], { stock: Math.max(0, (producto.stock || 0) - item.qty), updatedAt: Timestamp.now() });
      }
    }
    const ventaRef = doc(collection(db, "ventas"));
    ventaId = ventaRef.id;
    transaction.set(ventaRef, { ...saleData, id: ventaRef.id });
  });
  return { success: true, ventaId };
}

// ── 4. FIADO — Cuentas por Cobrar ────────────────────────────
export async function getVentasFiadoPendientes() {
  const q = query(collection(db, "ventas"), where("esVentaFiada","==",true),
    where("estadoCobro","==","pendiente"), orderBy("fecha","desc"));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}
export async function marcarFiadoCobrado(ventaId) {
  await updateDoc(doc(db, "ventas", ventaId), { estadoCobro: "cobrado", fechaCobro: Timestamp.now() });
  return { success: true };
}

// ── 5. ESTADÍSTICAS ───────────────────────────────────────────
const startOfDay = (d = new Date()) => { const x=new Date(d); x.setHours(0,0,0,0); return x; };
const endOfDay   = (d = new Date()) => { const x=new Date(d); x.setHours(23,59,59,999); return x; };
const startOfWeek = (d = new Date()) => {
  const x=new Date(d); const day=x.getDay(); x.setDate(x.getDate()+(day===0?-6:1-day)); x.setHours(0,0,0,0); return x;
};
const startOfMonth = (d = new Date()) => new Date(d.getFullYear(), d.getMonth(), 1, 0,0,0,0);
const endOfMonth   = (d = new Date()) => new Date(d.getFullYear(), d.getMonth()+1, 0, 23,59,59,999);

async function queryVentas(desde, hasta) {
  const q = query(collection(db,"ventas"), where("fecha",">=",Timestamp.fromDate(desde)),
    where("fecha","<=",Timestamp.fromDate(hasta)), orderBy("fecha","desc"));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function getSalesToday()          { return queryVentas(startOfDay(),    endOfDay()); }
export async function getSalesThisWeek()       { return queryVentas(startOfWeek(),   endOfDay()); }
export async function getSalesThisMonth()      { return queryVentas(startOfMonth(),  endOfMonth()); }
export async function getSalesByDate(date)     { return queryVentas(startOfDay(date), endOfDay(date)); }

export function sumSales(sales = []) {
  return sales.reduce((acc, v) => acc + (Number(v.total) || 0), 0);
}
export function groupSalesByDay(sales = []) {
  const map = {};
  for (const v of sales) {
    const key = v.fechaISO?.slice(0,10) ?? v.fecha?.toDate?.()?.toISOString().slice(0,10) ?? "sin-fecha";
    if (!map[key]) map[key] = { total: 0, count: 0 };
    map[key].total += Number(v.total) || 0; map[key].count += 1;
  }
  return Object.entries(map).sort(([a],[b]) => a.localeCompare(b)).map(([fecha,{total,count}]) => ({fecha,total,count}));
}
export function salesByMethod(sales = []) {
  const r = { efectivo: 0, tarjeta: 0, transferencia: 0, fiado: 0 };
  for (const v of sales) { const m = v.metodoPago; if (m in r) r[m] += Number(v.total)||0; }
  return { ...r, total: r.efectivo + r.tarjeta + r.transferencia + r.fiado };
}
export function getTopProducts(sales = [], limit = 8) {
  const map = {};
  for (const v of sales) {
    for (const item of v.items || []) {
      const pid = item.productId;
      if (!map[pid]) map[pid] = { productId: pid, productName: item.productName||"", marca: item.marca||"", totalQty:0, totalML:0, totalRD:0 };
      if (item.esLiquidoDetallado) { map[pid].totalML += Number(item.mlAmount)||0; map[pid].totalRD += Number(item.montoRD)||0; }
      else { map[pid].totalQty += Number(item.quantity)||0; map[pid].totalRD += Number(item.subtotal)||0; }
    }
  }
  return Object.values(map).sort((a,b) => b.totalRD - a.totalRD).slice(0, limit);
}
export async function getDailySummary() {
  const sales = await getSalesToday();
  const m = salesByMethod(sales);
  return { sales, totalEfectivo: m.efectivo, totalTarjeta: m.tarjeta, totalTransferencia: m.transferencia, totalFiado: m.fiado, grandTotal: m.total, count: sales.length };
}
