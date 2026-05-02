// src/firebase/services.js
// ─────────────────────────────────────────────────────────────
// Capa de servicios: CRUD productos + venta atómica + estadísticas
// PG VAPE SHOP — Actualizado con Base64, stats filtradas y reset seguro
// ─────────────────────────────────────────────────────────────
import {
  collection,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  Timestamp,
  query,
  where,
  orderBy,
  runTransaction,
  getDoc,
} from "firebase/firestore";
import { db } from "./config";

// ══════════════════════════════════════════════════════════════
// 1. IMAGEN BASE64
// ══════════════════════════════════════════════════════════════

/**
 * Convierte un File a string Base64 (data URL) usando FileReader.
 * Retorna una promesa que se resuelve con el data URL listo para
 * guardarse en Firestore o mostrarse como <img src={...} />.
 *
 * @param   {File} file  Objeto File proveniente de un <input type="file">
 * @returns {Promise<string>}  data URL  ej: "data:image/png;base64,iVBOR..."
 */
export function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    if (!file) {
      reject(new Error("No se proporcionó ningún archivo."));
      return;
    }
    const reader = new FileReader();
    reader.onload  = () => resolve(reader.result);
    reader.onerror = ()  => reject(new Error("No se pudo leer el archivo."));
    reader.readAsDataURL(file);
  });
}

// ══════════════════════════════════════════════════════════════
// 2. PRODUCTOS — CRUD
// ══════════════════════════════════════════════════════════════

/** Trae todos los productos de Firestore */
export async function getProducts() {
  const snap = await getDocs(collection(db, "productos"));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

/**
 * Crea un producto nuevo.
 * Acepta imageBase64 en vez de imageUrl cuando se usa input file.
 * @returns {Promise<{ success: true, id: string }>}
 */
export async function addProduct(productData) {
  const data = buildProductPayload(productData);
  data.createdAt = Timestamp.now();

  const ref = await addDoc(collection(db, "productos"), data);
  // Guardar id como campo para facilitar queries
  await updateDoc(ref, { id: ref.id });

  return { success: true, id: ref.id };
}

/**
 * Actualiza un producto existente.
 * @returns {Promise<{ success: true, id: string }>}
 */
export async function updateProduct(productId, productData) {
  const data = buildProductPayload(productData);
  await updateDoc(doc(db, "productos", productId), data);
  return { success: true, id: productId };
}

/** Elimina un producto */
export async function deleteProduct(productId) {
  await deleteDoc(doc(db, "productos", productId));
  return { success: true };
}

/** Construye el payload limpio para crear/editar un producto */
function buildProductPayload(data) {
  const isLiquidoDetallado =
    data.categoria === "Líquidos" && data.modoLiquido === "detallado";

  return {
    nombre:           String(data.nombre || "").trim(),
    marca:            String(data.marca  || "").trim(),
    categoria:        data.categoria || "Desechables",
    precio:           parseFloat(data.precio)  || 0,
    stock:            parseInt(data.stock, 10)  || 0,
    descripcion:      String(data.descripcion || "").trim(),
    niveles_nicotina: Array.isArray(data.niveles_nicotina) ? data.niveles_nicotina : [],
    // Imagen: acepta Base64 (input file) o URL legacy
    imageBase64:      data.imageBase64 || "",
    imageUrl:         data.imageUrl    || "",
    // Modo líquido
    modoLiquido:      data.categoria === "Líquidos" ? (data.modoLiquido || "botella") : "botella",
    ...(isLiquidoDetallado && {
      precioPorMl: parseFloat(data.precioPorMl) || 0,
      stockMl:     parseFloat(data.stockMl)     || 0,
    }),
    updatedAt: Timestamp.now(),
  };
}

// ══════════════════════════════════════════════════════════════
// 3. VENTAS — completeSale (transacción atómica optimizada)
// ══════════════════════════════════════════════════════════════

/**
 * Registra una venta en 'ventas' y descuenta stock atómicamente.
 *
 * Tipos de ítem soportados:
 *  - Normal:           { id, nombre, marca, qty, precio, nicotina? }
 *  - Líquido detallado:{ id, nombre, marca, esLiquidoDetallado:true,
 *                        mlAmount, montoRD, precioPorMl }
 *
 * @param {Array}  cartItems     - ítems del carrito
 * @param {number} total         - total en RD$
 * @param {string} paymentMethod - "efectivo" | "tarjeta" | "transferencia"
 * @param {string} cajero        - email del cajero
 * @returns {Promise<{ success: true, ventaId: string }>}
 */
export async function completeSale(cartItems, total, paymentMethod, cajero = null) {
  // Construir payload de venta
  const saleData = {
    items: cartItems.map((item) => {
      if (item.esLiquidoDetallado) {
        return {
          productId:          item.id,
          productName:        item.nombre,
          marca:              item.marca || "",
          esLiquidoDetallado: true,
          mlAmount:           item.mlAmount,
          precioPorMl:        item.precioPorMl,
          montoRD:            item.montoRD,
          subtotal:           item.montoRD,
        };
      }
      return {
        productId:   item.id,
        productName: item.nombre,
        marca:       item.marca || "",
        nicotina:    item.nicotina || null,
        quantity:    item.qty,
        unitPrice:   item.precio,
        subtotal:    item.precio * item.qty,
      };
    }),
    total,
    metodoPago: paymentMethod,
    fecha:      Timestamp.now(),
    fechaISO:   new Date().toISOString(),
    cajero,
  };

  let ventaId = "";

  await runTransaction(db, async (transaction) => {
    // ── Paso 1: Leer y verificar stock ──────────────────────────
    const refs  = {};
    const datos = {};

    for (const item of cartItems) {
      const pid = item.id;
      if (refs[pid]) continue; // ya leído

      const ref  = doc(db, "productos", pid);
      const snap = await transaction.get(ref);
      if (!snap.exists()) throw new Error(`Producto no encontrado: ${pid}`);

      refs[pid]  = ref;
      datos[pid] = snap.data();

      const producto = datos[pid];

      if (item.esLiquidoDetallado) {
        const disponible = producto.stockMl || 0;
        if (disponible < item.mlAmount) {
          throw new Error(
            `Stock ML insuficiente para "${item.nombre}". ` +
            `Disponible: ${disponible}ml, requerido: ${item.mlAmount}ml.`
          );
        }
      } else {
        const disponible = producto.stock || 0;
        if (disponible < item.qty) {
          throw new Error(
            `Stock insuficiente para "${item.nombre}". ` +
            `Disponible: ${disponible}, requerido: ${item.qty}.`
          );
        }
      }
    }

    // ── Paso 2: Descontar stock atómicamente ─────────────────────
    for (const item of cartItems) {
      const pid     = item.id;
      const producto = datos[pid];

      if (item.esLiquidoDetallado) {
        transaction.update(refs[pid], {
          stockMl:   Math.max(0, (producto.stockMl || 0) - item.mlAmount),
          updatedAt: Timestamp.now(),
        });
      } else {
        transaction.update(refs[pid], {
          stock:     Math.max(0, (producto.stock || 0) - item.qty),
          updatedAt: Timestamp.now(),
        });
      }
    }

    // ── Paso 3: Registrar venta ────────────────────────────────
    const ventaRef = doc(collection(db, "ventas"));
    ventaId = ventaRef.id;
    transaction.set(ventaRef, { ...saleData, id: ventaRef.id });
  });

  // Retornar éxito para que el frontend cierre el modal
  return { success: true, ventaId };
}

// ══════════════════════════════════════════════════════════════
// 4. ESTADÍSTICAS — ventas filtradas por período
// ══════════════════════════════════════════════════════════════

// ── Helpers de rangos de fecha ────────────────────────────────

function startOfDay(date = new Date()) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function endOfDay(date = new Date()) {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
}

function startOfWeek(date = new Date()) {
  const d      = new Date(date);
  const day    = d.getDay();                    // 0=dom…6=sáb
  const diff   = day === 0 ? -6 : 1 - day;     // retroceder hasta el lunes
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function startOfMonth(date = new Date()) {
  return new Date(date.getFullYear(), date.getMonth(), 1, 0, 0, 0, 0);
}

function endOfMonth(date = new Date()) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59, 999);
}

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

// ── Funciones exportadas ──────────────────────────────────────

/** Ventas de HOY */
export async function getSalesToday() {
  const now = new Date();
  return queryVentas(startOfDay(now), endOfDay(now));
}

/** Ventas de ESTA SEMANA (lunes → domingo) */
export async function getSalesThisWeek() {
  const now = new Date();
  return queryVentas(startOfWeek(now), endOfDay(now));
}

/** Ventas del MES ACTUAL */
export async function getSalesThisMonth() {
  const now = new Date();
  return queryVentas(startOfMonth(now), endOfMonth(now));
}

// ── Utilidades de cómputo ─────────────────────────────────────

/** Suma el total de un array de ventas */
export function sumSales(sales = []) {
  return sales.reduce((acc, v) => acc + (Number(v.total) || 0), 0);
}

/**
 * Agrupa ventas por día y retorna array ordenado para gráficos.
 * @returns {Array<{ fecha: string, total: number, count: number }>}
 */
export function groupSalesByDay(sales = []) {
  const map = {};
  for (const v of sales) {
    const key = v.fechaISO
      ? v.fechaISO.slice(0, 10)
      : v.fecha?.toDate?.()?.toISOString().slice(0, 10)
      ?? "sin-fecha";
    if (!map[key]) map[key] = { total: 0, count: 0 };
    map[key].total += Number(v.total) || 0;
    map[key].count += 1;
  }
  return Object.entries(map)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([fecha, { total, count }]) => ({ fecha, total, count }));
}

/**
 * Totales por método de pago.
 * @returns {{ efectivo: number, tarjeta: number, transferencia: number, total: number }}
 */
export function salesByMethod(sales = []) {
  const result = { efectivo: 0, tarjeta: 0, transferencia: 0 };
  for (const v of sales) {
    const m = v.metodoPago;
    if (m in result) result[m] += Number(v.total) || 0;
  }
  return { ...result, total: result.efectivo + result.tarjeta + result.transferencia };
}

// ══════════════════════════════════════════════════════════════
// 5. CIERRE DE CAJA (versión mejorada de getDailySummary)
// ══════════════════════════════════════════════════════════════

/**
 * Retorna todas las ventas del día con desglose por método de pago.
 * @returns {Promise<{ sales, totalEfectivo, totalTarjeta, totalTransferencia, grandTotal, count }>}
 */
export async function getDailySummary() {
  const now   = new Date();
  const sales = await queryVentas(startOfDay(now), endOfDay(now));
  const byMethod = salesByMethod(sales);

  return {
    sales,
    totalEfectivo:       byMethod.efectivo,
    totalTarjeta:        byMethod.tarjeta,
    totalTransferencia:  byMethod.transferencia,
    grandTotal:          byMethod.total,
    count:               sales.length,
  };
}
