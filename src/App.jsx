// ============================================================
// PG VAPE SHOP - App.jsx
// UI: Dark Mode SaaS · Glassmorphism · Lucide Icons
// Mejoras: Base64 image, PrintTicket, Dashboard con gráficas SVG,
//          cierre de modales correcto, completeSale desde services.js
// ============================================================

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import {
  ShoppingCart, Package, BarChart3, LogOut, Plus, Minus, Trash2,
  Search, X, Check, AlertTriangle, Zap, TrendingUp, DollarSign,
  ShoppingBag, Eye, EyeOff, Lock, User, ChevronRight, Tag,
  RefreshCw, Clock, Layers, ArrowUpRight, Flame, Box, Printer,
  Image, Calendar, Activity,
} from "lucide-react";

import { initializeApp } from "firebase/app";
import {
  getFirestore, collection, doc, updateDoc,
  onSnapshot, query, where, orderBy, Timestamp,
} from "firebase/firestore";
import {
  getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged,
} from "firebase/auth";

import {
  fileToBase64,
  addProduct,
  updateProduct,
  deleteProduct,
  completeSale,
  getSalesToday,
  getSalesThisWeek,
  getSalesThisMonth,
  getSalesByDate,
  getTopProducts,
  getVentasFiadoPendientes,
  marcarFiadoCobrado,
  sumSales,
  sumRealIncome,
  groupSalesByDay,
  salesByMethod,
} from "./firebase/services";

// ─── Firebase init ─────────────────────────────────────────
const firebaseConfig = {
  apiKey:            import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain:        import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId:         import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket:     import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId:             import.meta.env.VITE_FIREBASE_APP_ID,
};
const app  = initializeApp(firebaseConfig);
const db   = getFirestore(app);
const auth = getAuth(app);

// ─── Constantes ─────────────────────────────────────────────
const NICOTINE_LEVELS = ["0mg", "3mg", "6mg", "12mg", "18mg", "50mg", "FREE"];
const CATEGORIES      = ["Todos", "Desechables", "Pods", "Mods", "Líquidos", "Accesorios"];
const CATS_FORM       = ["Desechables", "Pods", "Mods", "Líquidos", "Accesorios"];

const formatCurrency = (amount) =>
  new Intl.NumberFormat("es-DO", { style: "currency", currency: "DOP" }).format(amount ?? 0);

const today = () => {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
};

// ── Imagen: prefiere Base64, fallback a URL ─────────────────
const imgSrc = (p) => p?.imageBase64 || p?.imageUrl || "";

// ============================================================
// PRINT STYLES — inyectadas una sola vez en <head>
// ============================================================
const PRINT_STYLES = `
@media print {
  body > *:not(#pg-ticket-root) { display: none !important; }
  #pg-ticket-root { display: block !important; }
  #pg-ticket-root .no-print { display: none !important; }
  @page { margin: 4mm; size: 80mm auto; }
}
`;

function injectPrintStyles() {
  if (document.getElementById("pg-print-style")) return;
  const s = document.createElement("style");
  s.id = "pg-print-style";
  s.textContent = PRINT_STYLES;
  document.head.appendChild(s);
}

// ============================================================
// TICKET DE IMPRESIÓN — estilo 80 mm
// ============================================================
function PrintTicket({ sale, onClose }) {
  const fecha = new Date().toLocaleString("es-DO", {
    dateStyle: "short",
    timeStyle: "short",
  });

  useEffect(() => {
    injectPrintStyles();
    // Pequeño delay para que el DOM esté listo antes de imprimir
    const t = setTimeout(() => window.print(), 150);
    return () => clearTimeout(t);
  }, []);

  return (
    <div
      id="pg-ticket-root"
      style={{
        position: "fixed", inset: 0, zIndex: 999,
        background: "rgba(0,0,0,0.75)",
        display: "flex", alignItems: "center", justifyContent: "center",
      }}
    >
      <div
        style={{
          background: "#fff", color: "#000",
          width: 300, padding: "16px 12px",
          fontFamily: "'Courier New', Courier, monospace",
          fontSize: 12, lineHeight: 1.5,
          borderRadius: 4,
        }}
      >
        {/* Cabecera */}
        <div style={{ textAlign: "center", marginBottom: 8 }}>
          <div style={{ fontWeight: 900, fontSize: 16, letterSpacing: 1 }}>PG VAPE SHOP</div>
          <div style={{ fontSize: 10, color: "#555" }}>Sistema POS</div>
          <div style={{ borderTop: "1px dashed #000", margin: "6px 0" }} />
          <div style={{ fontSize: 10 }}>{fecha}</div>
          {sale.cajero && <div style={{ fontSize: 10, color: "#555" }}>Cajero: {sale.cajero.split("@")[0]}</div>}
        </div>

        <div style={{ borderTop: "1px dashed #000", margin: "6px 0" }} />

        {/* Ítems */}
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
          <thead>
            <tr>
              <th style={{ textAlign: "left",  fontWeight: 700 }}>Producto</th>
              <th style={{ textAlign: "center", fontWeight: 700 }}>Cant</th>
              <th style={{ textAlign: "right",  fontWeight: 700 }}>Total</th>
            </tr>
          </thead>
          <tbody>
            {sale.items.map((item, i) => (
              <tr key={i}>
                <td style={{ paddingTop: 3 }}>
                  {item.productName || item.nombre}
                  {item.nicotina && <span style={{ fontSize: 9, color: "#666" }}> [{item.nicotina}]</span>}
                  {item.esLiquidoDetallado && (
                    <span style={{ fontSize: 9, color: "#333" }}> ({item.mlAmount}ml)</span>
                  )}
                </td>
                <td style={{ textAlign: "center", paddingTop: 3 }}>
                  {item.esLiquidoDetallado ? "1" : (item.quantity ?? item.qty)}
                </td>
                <td style={{ textAlign: "right", paddingTop: 3 }}>
                  {item.esLiquidoDetallado
                    ? `RD$${Number(item.montoRD).toFixed(2)}`
                    : `RD$${Number(item.subtotal ?? item.precio * item.qty).toFixed(2)}`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <div style={{ borderTop: "1px dashed #000", margin: "8px 0" }} />

        {/* Total */}
        <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 900, fontSize: 14 }}>
          <span>TOTAL</span>
          <span>RD${Number(sale.total).toFixed(2)}</span>
        </div>
        <div style={{ fontSize: 10, marginTop: 4, color: "#555" }}>
          Pago: <strong style={{ textTransform: "capitalize" }}>{sale.metodoPago}</strong>
          {sale.cambio > 0 && <span> · Cambio: RD${Number(sale.cambio).toFixed(2)}</span>}
        </div>

        <div style={{ borderTop: "1px dashed #000", margin: "8px 0" }} />
        <div style={{ textAlign: "center", fontSize: 10 }}>¡Gracias por tu visita! 🔥</div>

        {/* Botón cerrar — oculto al imprimir */}
        <button
          className="no-print"
          onClick={onClose}
          style={{
            marginTop: 14, width: "100%", padding: "8px 0",
            background: "#ea580c", color: "#fff",
            border: "none", borderRadius: 6,
            fontWeight: 700, cursor: "pointer", fontSize: 13,
          }}
        >
          Cerrar ticket
        </button>
      </div>
    </div>
  );
}

// ============================================================
// SPLASH SCREEN
// ============================================================
function SplashScreen() {
  return (
    <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-orange-500 to-orange-600 flex items-center justify-center shadow-lg shadow-orange-500/30 animate-pulse">
          <Flame className="w-8 h-8 text-white" />
        </div>
        <p className="text-zinc-500 text-sm tracking-widest uppercase">Cargando...</p>
      </div>
    </div>
  );
}

// ============================================================
// LOGIN SCREEN
// ============================================================
function LoginScreen() {
  const [email,    setEmail]    = useState("");
  const [password, setPassword] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [error,    setError]    = useState("");
  const [loading,  setLoading]  = useState(false);

  const handleLogin = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await signInWithEmailAndPassword(auth, email, password);
    } catch {
      setError("Credenciales inválidas. Verifica tu email y contraseña.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center p-4 relative overflow-hidden">
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[600px] h-[600px] bg-orange-500/5 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-0 right-0 w-[400px] h-[400px] bg-orange-600/5 rounded-full blur-3xl pointer-events-none" />
      <div
        className="absolute inset-0 opacity-[0.03] pointer-events-none"
        style={{
          backgroundImage: `linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px),
                            linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)`,
          backgroundSize: "50px 50px",
        }}
      />
      <div className="w-full max-w-md relative z-10">
        <div className="flex flex-col items-center mb-10">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-orange-500 to-orange-700 flex items-center justify-center shadow-2xl shadow-orange-500/40 mb-4">
            <Flame className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-3xl font-black text-white tracking-tight">PG VAPE SHOP</h1>
          <p className="text-zinc-500 text-sm mt-1">Sistema de Punto de Venta</p>
        </div>
        <div
          className="rounded-2xl p-8 border border-white/10"
          style={{ background: "rgba(26,26,26,0.8)", backdropFilter: "blur(24px)" }}
        >
          <h2 className="text-xl font-bold text-white mb-6">Iniciar Sesión</h2>
          <form onSubmit={handleLogin} className="space-y-5">
            <div className="space-y-1.5">
              <label className="text-zinc-400 text-xs font-semibold uppercase tracking-wider">Email</label>
              <div className="relative">
                <User className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                <input
                  type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                  required placeholder="admin@pgvape.com"
                  className="w-full bg-black/40 border border-zinc-800 text-white placeholder-zinc-600 rounded-xl pl-10 pr-4 py-3 text-sm focus:outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500/50 transition-all"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-zinc-400 text-xs font-semibold uppercase tracking-wider">Contraseña</label>
              <div className="relative">
                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                <input
                  type={showPass ? "text" : "password"} value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required placeholder="••••••••"
                  className="w-full bg-black/40 border border-zinc-800 text-white placeholder-zinc-600 rounded-xl pl-10 pr-12 py-3 text-sm focus:outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500/50 transition-all"
                />
                <button type="button" onClick={() => setShowPass(!showPass)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300 transition-colors">
                  {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
            {error && (
              <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3">
                <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
                <p className="text-red-400 text-sm">{error}</p>
              </div>
            )}
            <button
              type="submit" disabled={loading}
              className="w-full bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-400 hover:to-orange-500 text-white font-bold rounded-xl py-3 text-sm transition-all duration-200 shadow-lg shadow-orange-500/30 hover:-translate-y-0.5 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <>Entrar al Sistema <ChevronRight className="w-4 h-4" /></>}
            </button>
          </form>
        </div>
        <p className="text-center text-zinc-700 text-xs mt-6">© 2025 PG Vape Shop · Sistema POS</p>
      </div>
    </div>
  );
}

// ============================================================
// ROOT
// ============================================================
export default function App() {
  const [user,    setUser]    = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => { setUser(u); setLoading(false); });
    return unsub;
  }, []);

  if (loading) return <SplashScreen />;
  if (!user)   return <LoginScreen />;
  return <MainApp user={user} />;
}

// ============================================================
// MAIN APP
// ============================================================
function MainApp({ user }) {
  const [view,     setView]     = useState("pos");
  const [products, setProducts] = useState([]);
  const [sales,    setSales]    = useState([]);
  const [loading,  setLoading]  = useState(true);

  // Real-time productos
  useEffect(() => {
    const unsub = onSnapshot(collection(db, "productos"), (snap) => {
      setProducts(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      setLoading(false);
    });
    return unsub;
  }, []);

  // Real-time ventas de hoy
  useEffect(() => {
    const todayStart = Timestamp.fromDate(today());
    const q = query(
      collection(db, "ventas"),
      where("fecha", ">=", todayStart),
      orderBy("fecha", "desc")
    );
    const unsub = onSnapshot(q, (snap) => {
      setSales(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
    return unsub;
  }, []);

  const handleLogout = () => signOut(auth);

  const navItems = [
    { id: "pos",       label: "Punto de Venta", icon: ShoppingCart },
    { id: "dashboard", label: "Dashboard",       icon: BarChart3    },
    { id: "inventory", label: "Inventario",      icon: Package      },
    { id: "fiado",     label: "Fiado",           icon: Clock        },
  ];

  return (
    <div className="min-h-screen bg-[#0a0a0a] flex flex-col" style={{ fontFamily: "'Inter', sans-serif" }}>
      {/* TOP NAV */}
      <header className="bg-[#111111] border-b border-zinc-800/60 px-4 lg:px-6 py-3 flex items-center justify-between sticky top-0 z-50">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-orange-500 to-orange-600 flex items-center justify-center shadow-lg shadow-orange-500/30">
            <Flame className="w-4 h-4 text-white" />
          </div>
          <span className="font-black text-white text-lg tracking-tight hidden sm:block">PG VAPE</span>
          <span className="hidden sm:block text-zinc-600">|</span>
          <nav className="flex items-center gap-1">
            {navItems.map(({ id, label, icon: Icon }) => (
              <button
                key={id} onClick={() => setView(id)}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-all duration-200 ${
                  view === id
                    ? "bg-orange-500/15 text-orange-400 border border-orange-500/30"
                    : "text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800/50"
                }`}
              >
                <Icon className="w-4 h-4" />
                <span className="hidden md:block">{label}</span>
              </button>
            ))}
          </nav>
        </div>
        <div className="flex items-center gap-3">
          <div className="hidden sm:flex items-center gap-2 text-sm">
            <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-zinc-400">{user.email}</span>
          </div>
          <button
            onClick={handleLogout}
            className="flex items-center gap-2 text-zinc-500 hover:text-red-400 text-sm transition-colors px-2 py-1.5 rounded-lg hover:bg-red-500/10"
          >
            <LogOut className="w-4 h-4" />
            <span className="hidden sm:block">Salir</span>
          </button>
        </div>
      </header>

      {/* CONTENT */}
      <main className="flex-1">
        {loading ? (
          <div className="flex items-center justify-center h-96">
            <RefreshCw className="w-6 h-6 text-orange-500 animate-spin" />
          </div>
        ) : view === "pos" ? (
          <POSView products={products} sales={sales} user={user} />
        ) : view === "dashboard" ? (
          <DashboardView products={products} sales={sales} />
        ) : view === "fiado" ? (
          <FiadoView />
        ) : (
          <InventoryView products={products} />
        )}
      </main>
    </div>
  );
}

// ============================================================
// POS VIEW
// ============================================================
function POSView({ products, sales, user }) {
  const [cart,            setCart]            = useState([]);
  const [search,          setSearch]          = useState("");
  const [selectedCat,     setSelectedCat]     = useState("Todos");
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [selectedNic,     setSelectedNic]     = useState({});
  const [saleModal,       setSaleModal]       = useState(false);
  const [paymentMethod,   setPaymentMethod]   = useState("efectivo");
  const [amountPaid,      setAmountPaid]      = useState("");
  const [liquidModal,     setLiquidModal]     = useState(null);      // null | product (modal ML detallado)
  const [liquidTipoModal, setLiquidTipoModal] = useState(null);      // null | product (selector botella vs ML)
  const [liquidMonto,     setLiquidMonto]     = useState("");        // legacy compat
  const [liquidMlInput,   setLiquidMlInput]   = useState("");        // ML a vender (modal detallado)
  const [liquidPrecioInput, setLiquidPrecioInput] = useState("");    // Precio personalizado (modal detallado)
  const [ticket,          setTicket]          = useState(null);
  const [processing,      setProcessing]      = useState(false);
  const [saleError,       setSaleError]       = useState("");
  const [fiadoMode,       setFiadoMode]       = useState(false);
  const [fiadoNombre,     setFiadoNombre]     = useState("");
  const [fiadoTelefono,   setFiadoTelefono]   = useState("");

  const filteredProducts = useMemo(() => products.filter((p) => {
    const matchSearch = p.nombre?.toLowerCase().includes(search.toLowerCase()) ||
                        p.marca?.toLowerCase().includes(search.toLowerCase());
    const matchCat    = selectedCat === "Todos" || p.categoria === selectedCat;
    const hasStock    = p.categoria === "Líquidos"
      ? (p.total_ml_disponibles ?? p.stock_total_ml ?? p.stockMl ?? 0) > 0
      : (p.stock || 0) > 0;
    return matchSearch && matchCat && hasStock;
  }), [products, search, selectedCat]);

  const cartTotal = useMemo(() =>
    cart.reduce((sum, item) => {
      if (item.esLiquidoDetallado) return sum + item.montoRD;
      return sum + item.precio * item.qty;
    }, 0), [cart]);

  const change = parseFloat(amountPaid || 0) - cartTotal;

  // ── Carrito ──
  const addToCart = (product, nicotineLevel) => {
    if (product.categoria === "Líquidos") {
      // Todos los líquidos abren el modal de selección Botella vs ML
      setLiquidTipoModal(product);
      setLiquidMonto("");
      return;
    }
    const key = `${product.id}-${nicotineLevel || "default"}`;
    setCart((prev) => {
      const existing = prev.find((i) => i.key === key);
      if (existing) return prev.map((i) => i.key === key ? { ...i, qty: i.qty + 1 } : i);
      return [...prev, { key, id: product.id, nombre: product.nombre, marca: product.marca, precio: product.precio, nicotina: nicotineLevel, qty: 1 }];
    });
  };

  // ── Agregar botella completa de líquido al carrito ──
  const addLiquidBotellaToCart = (product) => {
    if (!product) return;
    const botellas = product.stock_botellas ?? product.stock ?? 0;
    if (botellas < 1) return;

    // Cadena de fallback: cubre todos los nombres de campo que pueden existir
    // en documentos Firestore según cuándo fueron creados.
    const precioVenta =
      parseFloat(product.precio_venta_botella) ||   // nombre que el usuario reporta en la DB
      parseFloat(product.precio_botella)        ||   // nombre usado por el código actual
      parseFloat(product.precio_por_botella)    ||   // alias legacy
      parseFloat(product.precioBotella)         ||   // camelCase legacy
      0;

    if (precioVenta <= 0) {
      // Producto sin precio de venta registrado — avisar sin bloquear el flujo
      console.warn(`[POS] producto "${product.nombre}" no tiene precio_venta_botella definido.`, product);
    }

    const key = `botella-${product.id}-${Date.now()}`;
    setCart((prev) => [...prev, {
      key,
      id:               product.id,
      nombre:           product.nombre,
      marca:            product.marca,
      precio:           precioVenta,        // ← precio real desde Firestore
      qty:              1,
      esLiquidoBotella: true,
      mlPorBotella:     parseFloat(product.ml_por_botella) || 0,
    }]);
    setLiquidTipoModal(null);
  };

  const addLiquidToCart = () => {
    const product = liquidModal || liquidTipoModal;
    if (!product) return;
    const mlAmount = parseFloat(liquidMlInput);
    const monto    = parseFloat(liquidPrecioInput);
    if (!mlAmount || mlAmount <= 0 || !monto || monto <= 0) return;
    const precioPorMl = monto / mlAmount;
    const key = `liquid-${product.id}-${Date.now()}`;
    setCart((prev) => [...prev, {
      key, id: product.id, nombre: product.nombre, marca: product.marca,
      esLiquidoDetallado: true, mlAmount, montoRD: monto, precioPorMl, precio: monto, qty: 1,
    }]);
    setLiquidModal(null);
    setLiquidTipoModal(null);
    setLiquidMlInput("");
    setLiquidPrecioInput("");
    setLiquidMonto("");
  };

  const updateQty    = (key, delta) => setCart((prev) => prev.map((i) => i.key === key ? { ...i, qty: Math.max(0, i.qty + delta) } : i).filter((i) => i.qty > 0));
  const removeFromCart = (key)      => setCart((prev) => prev.filter((i) => i.key !== key));
  const clearCart    = ()           => setCart([]);

  // ── Confirmar venta — usa completeSale de services.js ──────
  const confirmSale = async () => {
    setSaleError("");
    if (fiadoMode) {
      if (!fiadoNombre.trim()) { setSaleError("El nombre del cliente es obligatorio para fiar."); return; }
      if (!fiadoTelefono.trim()) { setSaleError("El teléfono del cliente es obligatorio para fiar."); return; }
    }
    setProcessing(true);
    try {
      const method = fiadoMode ? "fiado" : paymentMethod;
      const fiadoInfo = fiadoMode ? { nombre: fiadoNombre.trim(), telefono: fiadoTelefono.trim() } : null;
      const result = await completeSale(cart, cartTotal, method, user?.email ?? null, fiadoInfo);

      if (result.success) {
        const ticketData = {
          items:      cart,
          total:      cartTotal,
          metodoPago: method,
          cajero:     user?.email,
          cambio:     !fiadoMode && paymentMethod === "efectivo" && change > 0 ? change : 0,
          ventaId:    result.ventaId,
          esVentaFiada: fiadoMode,
          clienteNombre: fiadoMode ? fiadoNombre : null,
        };
        setSaleModal(false);
        setAmountPaid("");
        setPaymentMethod("efectivo");
        setFiadoMode(false);
        setFiadoNombre("");
        setFiadoTelefono("");
        clearCart();
        setTicket(ticketData);
      }
    } catch (err) {
      setSaleError(err.message || "Error al procesar la venta.");
    } finally {
      setProcessing(false);
    }
  };

  return (
    <div className="flex h-[calc(100vh-57px)]">
      {/* ─── LEFT: Catálogo ─── */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Search + Filtros */}
        <div className="bg-[#111111] border-b border-zinc-800/60 p-4 space-y-3">
          <div className="relative">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
            <input
              type="text" placeholder="Buscar producto o marca..." value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-zinc-900 border border-zinc-800 text-white placeholder-zinc-600 rounded-xl pl-10 pr-10 py-2.5 text-sm focus:outline-none focus:border-orange-500/60 focus:ring-1 focus:ring-orange-500/30 transition-all"
            />
            {search && (
              <button onClick={() => setSearch("")} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300">
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
          <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
            {CATEGORIES.map((cat) => (
              <button
                key={cat} onClick={() => setSelectedCat(cat)}
                className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold transition-all duration-200 ${
                  selectedCat === cat
                    ? "bg-orange-500 text-white shadow-lg shadow-orange-500/30"
                    : "bg-zinc-800/60 text-zinc-400 hover:bg-zinc-700/60 hover:text-zinc-200"
                }`}
              >{cat}</button>
            ))}
          </div>
        </div>

        {/* Grilla de productos */}
        <div className="flex-1 overflow-y-auto p-4">
          {filteredProducts.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full gap-3 text-zinc-600">
              <Box className="w-12 h-12 opacity-30" />
              <p className="text-sm">No se encontraron productos</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
              {filteredProducts.map((product) => (
                <ProductCard
                  key={product.id}
                  product={product}
                  selectedNic={selectedNic[product.id]}
                  onSelectNic={(nic) => setSelectedNic((prev) => ({ ...prev, [product.id]: nic }))}
                  onAdd={() => addToCart(product, selectedNic[product.id])}
                  onPreview={() => setSelectedProduct(product)}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ─── RIGHT: Carrito ─── */}
      <div className="w-80 xl:w-96 bg-[#111111] border-l border-zinc-800/60 flex flex-col shrink-0">
        <div className="px-4 py-3 border-b border-zinc-800/60 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShoppingCart className="w-5 h-5 text-orange-400" />
            <span className="font-bold text-white">Carrito</span>
            {cart.length > 0 && (
              <span className="bg-orange-500 text-white text-xs font-bold px-2 py-0.5 rounded-full">
                {cart.reduce((s, i) => s + i.qty, 0)}
              </span>
            )}
          </div>
          {cart.length > 0 && (
            <button onClick={clearCart} className="text-zinc-600 hover:text-red-400 transition-colors">
              <Trash2 className="w-4 h-4" />
            </button>
          )}
        </div>

        <div className="flex-1 overflow-y-auto px-3 py-3 space-y-2">
          {cart.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full gap-3 text-zinc-700">
              <ShoppingCart className="w-10 h-10 opacity-30" />
              <p className="text-sm text-center">El carrito está vacío.<br />Agrega productos.</p>
            </div>
          ) : (
            cart.map((item) => (
              <CartItem key={item.key} item={item} onUpdate={updateQty} onRemove={removeFromCart} />
            ))
          )}
        </div>

        <div className="border-t border-zinc-800/60 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-zinc-400 text-sm">Subtotal</span>
            <span className="text-white font-semibold">{formatCurrency(cartTotal)}</span>
          </div>
          <div className="flex items-center justify-between border-t border-zinc-800 pt-3">
            <span className="text-white font-bold">Total</span>
            <span className="text-orange-400 font-black text-xl">{formatCurrency(cartTotal)}</span>
          </div>
          <button
            onClick={() => { setSaleError(""); setFiadoMode(false); setSaleModal(true); }}
            disabled={cart.length === 0}
            className="w-full bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-400 hover:to-orange-500 disabled:opacity-30 disabled:cursor-not-allowed text-white font-bold rounded-xl py-3 text-sm transition-all shadow-lg shadow-orange-500/20 hover:-translate-y-0.5 flex items-center justify-center gap-2"
          >
            <Zap className="w-4 h-4" />
            Cobrar {formatCurrency(cartTotal)}
          </button>
          <button
            onClick={() => { setSaleError(""); setFiadoMode(true); setSaleModal(true); }}
            disabled={cart.length === 0}
            className="w-full bg-zinc-800 hover:bg-amber-500/20 border border-zinc-700 hover:border-amber-500/50 disabled:opacity-30 disabled:cursor-not-allowed text-amber-400 font-bold rounded-xl py-2.5 text-sm transition-all flex items-center justify-center gap-2"
          >
            <Clock className="w-4 h-4" />
            Fiar
          </button>
        </div>
      </div>

      {/* ── MODAL: Confirmar venta ── */}
      {saleModal && (
        <SaleModal
          cart={cart}
          total={cartTotal}
          paymentMethod={paymentMethod}
          setPaymentMethod={setPaymentMethod}
          amountPaid={amountPaid}
          setAmountPaid={setAmountPaid}
          change={change}
          onConfirm={confirmSale}
          onClose={() => { setSaleModal(false); setSaleError(""); setFiadoMode(false); setFiadoNombre(""); setFiadoTelefono(""); }}
          processing={processing}
          error={saleError}
          fiadoMode={fiadoMode}
          fiadoNombre={fiadoNombre}
          setFiadoNombre={setFiadoNombre}
          fiadoTelefono={fiadoTelefono}
          setFiadoTelefono={setFiadoTelefono}
        />
      )}

      {/* ── TICKET DE IMPRESIÓN ── */}
      {ticket && <PrintTicket sale={ticket} onClose={() => setTicket(null)} />}

      {/* ── MODAL: Selector Botella vs ML para líquidos detallados ── */}
      {liquidTipoModal && !liquidModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => setLiquidTipoModal(null)}>
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
          <div className="relative bg-[#1a1a1a] border border-cyan-500/30 rounded-2xl p-6 w-full max-w-sm shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <button onClick={() => setLiquidTipoModal(null)} className="absolute top-4 right-4 text-zinc-500 hover:text-white"><X className="w-5 h-5" /></button>
            <div className="flex items-center gap-3 mb-5">
              <div className="w-12 h-12 rounded-full bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center">
                <Package className="w-5 h-5 text-cyan-400" />
              </div>
              <div>
                <p className="text-white font-bold">{liquidTipoModal.nombre}</p>
                <p className="text-cyan-400 text-sm">
                  {formatCurrency(liquidTipoModal.precioPorMl || 0)}/ml ·{" "}
                  {liquidTipoModal.total_ml_disponibles ?? liquidTipoModal.stockMl ?? 0}ml disp. ·{" "}
                  {liquidTipoModal.stock_botellas ?? 0} botellas
                </p>
              </div>
            </div>
            <p className="text-zinc-400 text-xs font-semibold uppercase tracking-wider mb-3">¿Cómo deseas vender este líquido?</p>
            <div className="grid grid-cols-2 gap-3">
              {/* Opción: Botella completa */}
              <button
                onClick={() => addLiquidBotellaToCart(liquidTipoModal)}
                disabled={(liquidTipoModal.stock_botellas ?? liquidTipoModal.stock ?? 0) < 1}
                className="flex flex-col items-center gap-2 bg-zinc-900 hover:bg-cyan-500/10 border border-zinc-700 hover:border-cyan-500/50 disabled:opacity-40 disabled:cursor-not-allowed rounded-xl p-4 transition-all group"
              >
                <span className="text-3xl">🍾</span>
                <span className="text-white font-bold text-sm">Botella completa</span>
                <span className="text-zinc-500 text-xs text-center">
                  {formatCurrency(
                    parseFloat(liquidTipoModal.precio_venta_botella) ||
                    parseFloat(liquidTipoModal.precio_botella)        ||
                    parseFloat(liquidTipoModal.precio_por_botella)    ||
                    parseFloat(liquidTipoModal.precioBotella)         ||
                    0
                  )} · {liquidTipoModal.ml_por_botella || "?"}ml
                </span>
                <span className="text-cyan-400 text-xs font-semibold">
                  {liquidTipoModal.stock_botellas ?? liquidTipoModal.stock ?? 0} disp.
                </span>
              </button>
              {/* Opción: ML detallado */}
              <button
                onClick={() => { setLiquidModal(liquidTipoModal); setLiquidMlInput(""); setLiquidPrecioInput(""); }}
                className="flex flex-col items-center gap-2 bg-zinc-900 hover:bg-cyan-500/10 border border-zinc-700 hover:border-cyan-500/50 rounded-xl p-4 transition-all group"
              >
                <span className="text-3xl">💧</span>
                <span className="text-white font-bold text-sm">Por ML</span>
                <span className="text-zinc-500 text-xs text-center">
                  {formatCurrency(liquidTipoModal.precioPorMl || 0)}/ml
                </span>
                <span className="text-cyan-400 text-xs font-semibold">
                  {liquidTipoModal.total_ml_disponibles ?? liquidTipoModal.stockMl ?? 0}ml disp.
                </span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL: Vista detalle de producto ── */}
      {selectedProduct && (
        <ProductDetailModal
          product={selectedProduct}
          onClose={() => setSelectedProduct(null)}
          onAdd={(nic) => { addToCart(selectedProduct, nic); setSelectedProduct(null); }}
        />
      )}

      {/* ── MODAL: Monto para líquido detallado ── */}
      {liquidModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => { setLiquidModal(null); setLiquidMlInput(""); setLiquidPrecioInput(""); }}>
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
          <div className="relative bg-[#1a1a1a] border border-cyan-500/30 rounded-2xl p-6 w-full max-w-sm shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <button onClick={() => { setLiquidModal(null); setLiquidTipoModal(null); setLiquidMlInput(""); setLiquidPrecioInput(""); }} className="absolute top-4 right-4 text-zinc-500 hover:text-white">
              <X className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-3 mb-5">
              {imgSrc(liquidModal) ? (
                <img src={imgSrc(liquidModal)} alt="" className="w-12 h-12 rounded-full object-cover border border-cyan-500/30" onError={(e) => e.target.style.display = "none"} />
              ) : (
                <div className="w-12 h-12 rounded-full bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center">
                  <Package className="w-5 h-5 text-cyan-400" />
                </div>
              )}
              <div>
                <p className="text-white font-bold">{liquidModal.nombre}</p>
                <p className="text-cyan-400 text-sm">{liquidModal.total_ml_disponibles ?? liquidModal.stockMl ?? 0}ml disp. · 🍾{liquidModal.stock_botellas ?? 0} bot.</p>
              </div>
            </div>
            {/* Input: ML a vender */}
            <label className="text-zinc-400 text-xs font-semibold uppercase tracking-wider block mb-1.5">ML a vender</label>
            <input
              type="number" value={liquidMlInput} onChange={(e) => setLiquidMlInput(e.target.value)}
              placeholder="Ej: 10, 30, 60..." min="0" autoFocus
              className="w-full bg-zinc-900 border border-cyan-700/50 text-white placeholder-zinc-600 rounded-xl px-4 py-3 text-lg focus:outline-none focus:border-cyan-500 transition-all mb-4"
            />
            {/* Input: Precio personalizado */}
            <label className="text-zinc-400 text-xs font-semibold uppercase tracking-wider block mb-1.5">Precio personalizado (RD$)</label>
            <input
              type="number" value={liquidPrecioInput} onChange={(e) => setLiquidPrecioInput(e.target.value)}
              placeholder="Ej: 50, 100, 200..." min="0"
              className="w-full bg-zinc-900 border border-cyan-700/50 text-white placeholder-zinc-600 rounded-xl px-4 py-3 text-lg focus:outline-none focus:border-cyan-500 transition-all mb-3"
            />
            {liquidMlInput && liquidPrecioInput && parseFloat(liquidMlInput) > 0 && parseFloat(liquidPrecioInput) > 0 && (
              <div className="bg-cyan-500/10 border border-cyan-500/20 rounded-xl px-4 py-2.5 mb-4 flex justify-between items-center">
                <span className="text-zinc-400 text-sm">Precio/ml implícito:</span>
                <span className="text-cyan-400 font-black text-lg">
                  {formatCurrency(parseFloat(liquidPrecioInput) / parseFloat(liquidMlInput))}/ml
                </span>
              </div>
            )}
            <div className="flex gap-3">
              <button onClick={() => { setLiquidModal(null); setLiquidTipoModal(null); setLiquidMlInput(""); setLiquidPrecioInput(""); }} className="flex-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-semibold rounded-xl py-3 text-sm transition-colors">Cancelar</button>
              <button
                onClick={addLiquidToCart}
                disabled={!liquidMlInput || parseFloat(liquidMlInput) <= 0 || !liquidPrecioInput || parseFloat(liquidPrecioInput) <= 0}
                className="flex-1 bg-gradient-to-r from-cyan-500 to-cyan-600 hover:from-cyan-400 hover:to-cyan-500 disabled:opacity-40 text-white font-bold rounded-xl py-3 text-sm transition-all shadow-lg shadow-cyan-500/25 flex items-center justify-center gap-2"
              >
                <Plus className="w-4 h-4" /> Agregar al Carrito
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Product Card ──────────────────────────────────────────
function ProductCard({ product, selectedNic, onSelectNic, onAdd, onPreview }) {
  const nicLevels         = product.niveles_nicotina || [];
  const isLowStock        = product.stock <= 5;
  const isLiquidoDetallado = product.categoria === "Líquidos";
  const src               = imgSrc(product);

  return (
    <div className="bg-zinc-900/60 border border-zinc-800/60 rounded-2xl flex flex-col hover:border-orange-500/30 hover:bg-zinc-900/90 transition-all duration-200 group relative overflow-hidden">
      {isLowStock && !isLiquidoDetallado && (
        <div className="absolute top-2 right-2 z-10 bg-red-500/90 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">¡Pocas!</div>
      )}
      {isLiquidoDetallado && (
        <div className="absolute top-2 left-2 z-10 bg-cyan-500/90 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">ML</div>
      )}
      <div className="aspect-square bg-zinc-800/60 rounded-t-2xl overflow-hidden cursor-pointer flex items-center justify-center" onClick={onPreview}>
        {src ? (
          <img src={src} alt={product.nombre} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" onError={(e) => { e.target.style.display = "none"; }} />
        ) : (
          <Package className="w-10 h-10 text-zinc-600 group-hover:text-orange-400 transition-colors" />
        )}
      </div>
      <div className="p-3 flex flex-col gap-2 flex-1">
        <div className="min-w-0">
          <p className="text-[11px] text-zinc-500 font-medium truncate">{product.marca}</p>
          <p className="text-sm font-bold text-white truncate leading-tight">{product.nombre}</p>
          {isLiquidoDetallado ? (
            <div className="mt-0.5">
              <p className="text-cyan-400 font-black text-base">
                {formatCurrency(
                  parseFloat(product.precio_venta_botella) ||
                  parseFloat(product.precio_botella)        ||
                  0
                )}
                <span className="text-xs font-normal text-zinc-500"> / botella</span>
              </p>
              <p className="text-[10px] text-zinc-600">{product.total_ml_disponibles ?? product.stockMl ?? 0}ml · 🍾{product.stock_botellas ?? 0} bot.</p>
            </div>
          ) : (
            <>
              <p className="text-orange-400 font-black text-base mt-0.5">{formatCurrency(product.precio)}</p>
              <p className="text-[10px] text-zinc-600">Stock: {product.stock}</p>
            </>
          )}
        </div>
        {nicLevels.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {nicLevels.map((nic) => (
              <button
                key={nic} onClick={() => onSelectNic(nic)}
                className={`text-[10px] px-2 py-0.5 rounded-full font-semibold transition-all duration-150 ${
                  selectedNic === nic ? "bg-orange-500 text-white" : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700"
                }`}
              >{nic}</button>
            ))}
          </div>
        )}
        <button
          onClick={onAdd}
          className="mt-auto w-full bg-zinc-800 hover:bg-orange-500 text-zinc-400 hover:text-white rounded-xl py-2 text-xs font-bold transition-all duration-200 flex items-center justify-center gap-1.5"
        >
          <Plus className="w-3.5 h-3.5" />
          {isLiquidoDetallado ? "Ingresar Monto" : "Agregar"}
        </button>
      </div>
    </div>
  );
}

// ─── Cart Item ─────────────────────────────────────────────
function CartItem({ item, onUpdate, onRemove }) {
  const isLiquidoDetallado = item.esLiquidoDetallado;
  const isLiquidoBotella   = item.esLiquidoBotella;
  return (
    <div className="bg-zinc-900/60 border border-zinc-800/40 rounded-xl p-3 flex items-center gap-3">
      <div className="flex-1 min-w-0">
        <p className="text-white text-sm font-semibold truncate">{item.nombre}</p>
        {item.nicotina && (
          <span className="inline-block text-[10px] bg-orange-500/15 text-orange-400 border border-orange-500/20 px-1.5 py-0.5 rounded-full font-semibold mt-0.5">{item.nicotina}</span>
        )}
        {isLiquidoDetallado ? (
          <div className="mt-0.5">
            <p className="text-cyan-400 text-xs font-bold">{item.mlAmount} ml</p>
            <p className="text-zinc-500 text-xs">{formatCurrency(item.precioPorMl)}/ml</p>
          </div>
        ) : isLiquidoBotella ? (
          <div className="mt-0.5">
            <p className="text-cyan-400 text-xs font-bold">🍾 Botella ({item.mlPorBotella || "?"}ml)</p>
            <p className="text-zinc-500 text-xs">{formatCurrency(item.precio)} / botella</p>
          </div>
        ) : (
          <p className="text-zinc-500 text-xs mt-0.5">{formatCurrency(item.precio)} / u</p>
        )}
      </div>
      <div className="flex items-center gap-1.5 shrink-0">
        {isLiquidoDetallado ? (
          <button onClick={() => onRemove(item.key)} className="w-6 h-6 rounded-lg bg-zinc-800 hover:bg-red-500/20 text-zinc-600 hover:text-red-400 flex items-center justify-center transition-colors">
            <Trash2 className="w-3 h-3" />
          </button>
        ) : (
          <>
            <button onClick={() => onUpdate(item.key, -1)} className="w-6 h-6 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-white flex items-center justify-center transition-colors"><Minus className="w-3 h-3" /></button>
            <span className="text-white font-bold text-sm w-5 text-center">{item.qty}</span>
            <button onClick={() => onUpdate(item.key,  1)} className="w-6 h-6 rounded-lg bg-zinc-800 hover:bg-orange-500 text-zinc-400 hover:text-white flex items-center justify-center transition-colors"><Plus className="w-3 h-3" /></button>
            <button onClick={() => onRemove(item.key)} className="w-6 h-6 rounded-lg bg-zinc-800 hover:bg-red-500/20 text-zinc-600 hover:text-red-400 flex items-center justify-center transition-colors ml-1"><Trash2 className="w-3 h-3" /></button>
          </>
        )}
      </div>
      <p className="text-orange-400 font-bold text-sm shrink-0 w-16 text-right">
        {isLiquidoDetallado ? formatCurrency(item.montoRD) : formatCurrency(item.precio * item.qty)}
      </p>
    </div>
  );
}

// ─── Sale Modal ────────────────────────────────────────────
function SaleModal({ cart, total, paymentMethod, setPaymentMethod, amountPaid, setAmountPaid, change, onConfirm, onClose, processing, error, fiadoMode, fiadoNombre, setFiadoNombre, fiadoTelefono, setFiadoTelefono }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
      <div className="relative bg-[#1a1a1a] border border-zinc-700/60 rounded-2xl p-6 w-full max-w-md shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-white font-bold text-lg flex items-center gap-2">
            {fiadoMode ? <><Clock className="w-5 h-5 text-amber-400" /> Registrar como Fiado</> : "Confirmar Venta"}
          </h3>
          <button onClick={onClose} className="text-zinc-500 hover:text-white transition-colors"><X className="w-5 h-5" /></button>
        </div>

        {/* Resumen del carrito */}
        <div className="bg-zinc-900/60 rounded-xl p-3 mb-4 space-y-1.5 max-h-40 overflow-y-auto">
          {cart.map((item) => (
            <div key={item.key} className="flex justify-between text-sm">
              <span className="text-zinc-400">
                {item.esLiquidoDetallado ? (
                  <>{item.nombre}<span className="text-cyan-400 text-xs ml-1">({item.mlAmount}ml)</span></>
                ) : (
                  <>{item.qty}× {item.nombre}{item.nicotina && <span className="text-orange-400 text-xs ml-1">({item.nicotina})</span>}</>
                )}
              </span>
              <span className="text-white font-medium">
                {item.esLiquidoDetallado ? formatCurrency(item.montoRD) : formatCurrency(item.precio * item.qty)}
              </span>
            </div>
          ))}
        </div>

        {/* Total */}
        <div className={`flex justify-between items-center mb-5 border rounded-xl px-4 py-3 ${fiadoMode ? "bg-amber-500/10 border-amber-500/20" : "bg-orange-500/10 border-orange-500/20"}`}>
          <span className={`font-semibold ${fiadoMode ? "text-amber-300" : "text-orange-300"}`}>Total {fiadoMode ? "a Fiar" : "a Cobrar"}</span>
          <span className={`font-black text-2xl ${fiadoMode ? "text-amber-400" : "text-orange-400"}`}>{formatCurrency(total)}</span>
        </div>

        {/* Fiado: datos del cliente */}
        {fiadoMode ? (
          <div className="space-y-3 mb-5 bg-amber-500/5 border border-amber-500/20 rounded-xl p-4">
            <p className="text-amber-400 text-xs font-semibold uppercase tracking-wider flex items-center gap-1.5">
              <User className="w-3.5 h-3.5" /> Datos del Cliente (Obligatorio)
            </p>
            <input
              type="text"
              placeholder="Nombre completo *"
              value={fiadoNombre}
              onChange={(e) => setFiadoNombre(e.target.value)}
              className="w-full bg-zinc-900 border border-amber-700/50 text-white placeholder-zinc-500 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-amber-500/60 transition-all"
            />
            <input
              type="tel"
              placeholder="Teléfono *"
              value={fiadoTelefono}
              onChange={(e) => setFiadoTelefono(e.target.value)}
              className="w-full bg-zinc-900 border border-amber-700/50 text-white placeholder-zinc-500 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-amber-500/60 transition-all"
            />
          </div>
        ) : (
          <>
            {/* Método de pago */}
            <div className="mb-4">
              <p className="text-zinc-400 text-xs font-semibold uppercase tracking-wider mb-2">Método de Pago</p>
              <div className="grid grid-cols-3 gap-2">
                {["efectivo", "tarjeta", "transferencia"].map((m) => (
                  <button
                    key={m} onClick={() => setPaymentMethod(m)}
                    className={`py-2 px-3 rounded-xl text-xs font-bold capitalize transition-all ${
                      paymentMethod === m ? "bg-orange-500 text-white shadow-lg shadow-orange-500/30" : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700"
                    }`}
                  >{m}</button>
                ))}
              </div>
            </div>

            {/* Calculadora de cambio */}
            {paymentMethod === "efectivo" && (
              <div className="mb-5 space-y-2">
                <p className="text-zinc-400 text-xs font-semibold uppercase tracking-wider">Monto Recibido</p>
                <input
                  type="number" value={amountPaid} onChange={(e) => setAmountPaid(e.target.value)}
                  placeholder="0.00"
                  className="w-full bg-zinc-900 border border-zinc-700 text-white rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-orange-500/60 transition-all"
                />
                {amountPaid && (
                  <div className={`flex justify-between px-4 py-2.5 rounded-xl ${change >= 0 ? "bg-emerald-500/10 border border-emerald-500/20" : "bg-red-500/10 border border-red-500/20"}`}>
                    <span className={`text-sm font-semibold ${change >= 0 ? "text-emerald-400" : "text-red-400"}`}>Cambio</span>
                    <span className={`font-black ${change >= 0 ? "text-emerald-400" : "text-red-400"}`}>{formatCurrency(change >= 0 ? change : 0)}</span>
                  </div>
                )}
              </div>
            )}
          </>
        )}

        {/* Error */}
        {error && (
          <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 mb-4">
            <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
            <p className="text-red-400 text-sm">{error}</p>
          </div>
        )}

        <div className="flex gap-3">
          <button onClick={onClose} className="flex-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-semibold rounded-xl py-3 text-sm transition-colors">Cancelar</button>
          <button
            onClick={onConfirm}
            disabled={processing || (!fiadoMode && paymentMethod === "efectivo" && amountPaid && change < 0)}
            className={`flex-1 ${fiadoMode ? "bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 shadow-amber-500/30" : "bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-400 hover:to-orange-500 shadow-orange-500/30"} disabled:opacity-40 text-white font-bold rounded-xl py-3 text-sm transition-all shadow-lg flex items-center justify-center gap-2`}
          >
            {processing ? <RefreshCw className="w-4 h-4 animate-spin" /> : <><Check className="w-4 h-4" />{fiadoMode ? "Registrar Fiado" : "Confirmar"}</>}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Product Detail Modal ──────────────────────────────────
function ProductDetailModal({ product, onClose, onAdd }) {
  const [nic, setNic] = useState(product.niveles_nicotina?.[0] || null);
  const src = imgSrc(product);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
      <div className="relative bg-[#1a1a1a] border border-zinc-700/60 rounded-2xl p-6 w-full max-w-sm shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <button onClick={onClose} className="absolute top-4 right-4 text-zinc-500 hover:text-white"><X className="w-5 h-5" /></button>
        <div className="aspect-video bg-zinc-900/60 rounded-xl flex items-center justify-center mb-4 overflow-hidden">
          {src ? (
            <img src={src} alt={product.nombre} className="w-full h-full object-cover" onError={(e) => e.target.style.display = "none"} />
          ) : (
            <Package className="w-14 h-14 text-zinc-700" />
          )}
        </div>
        <p className="text-zinc-500 text-xs font-semibold mb-0.5">{product.marca}</p>
        <h3 className="text-white font-black text-xl mb-1">{product.nombre}</h3>
        <p className="text-orange-400 font-black text-2xl mb-3">
          {formatCurrency(
            product.categoria === "Líquidos"
              ? (parseFloat(product.precio_venta_botella) || parseFloat(product.precio_botella) || 0)
              : product.precio
          )}
        </p>
        {product.descripcion && <p className="text-zinc-400 text-sm mb-4">{product.descripcion}</p>}
        <div className="flex justify-between text-sm mb-4">
          <span className="text-zinc-500">Categoría: <span className="text-zinc-300">{product.categoria}</span></span>
          <span className={`font-semibold ${product.stock <= 5 ? "text-red-400" : "text-emerald-400"}`}>Stock: {product.stock}</span>
        </div>
        {product.niveles_nicotina?.length > 0 && (
          <div className="mb-4">
            <p className="text-zinc-400 text-xs font-semibold uppercase tracking-wider mb-2">Nicotina</p>
            <div className="flex flex-wrap gap-2">
              {product.niveles_nicotina.map((n) => (
                <button key={n} onClick={() => setNic(n)}
                  className={`px-3 py-1.5 rounded-full text-xs font-bold transition-all ${nic === n ? "bg-orange-500 text-white" : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700"}`}>
                  {n}
                </button>
              ))}
            </div>
          </div>
        )}
        <button onClick={() => onAdd(nic)}
          className="w-full bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-400 hover:to-orange-500 text-white font-bold rounded-xl py-3 text-sm transition-all shadow-lg shadow-orange-500/30 flex items-center justify-center gap-2">
          <Plus className="w-4 h-4" /> Agregar al Carrito
        </button>
      </div>
    </div>
  );
}

// ============================================================
// DASHBOARD VIEW — Gráficas SVG puras (sin recharts)
// ============================================================
function DashboardView({ products, sales: salesToday }) {
  const [period,    setPeriod]    = useState("today");
  const [salesData, setSalesData] = useState([]);
  const [loading,   setLoading]   = useState(true);
  // Calendar date picker
  const todayStr = new Date().toISOString().slice(0, 10);
  const [selectedDate, setSelectedDate] = useState(todayStr);
  const [calMode, setCalMode] = useState(false); // false = período, true = fecha exacta

  useEffect(() => {
    setLoading(true);
    let fetcher;
    if (calMode) {
      const dateObj = new Date(selectedDate + "T12:00:00"); // evitar desfase de zona horaria
      fetcher = () => getSalesByDate(dateObj);
    } else {
      fetcher = period === "today" ? getSalesToday : period === "week" ? getSalesThisWeek : getSalesThisMonth;
    }
    fetcher().then(setSalesData).finally(() => setLoading(false));
  }, [period, calMode, selectedDate]);

  const chartData  = groupSalesByDay(salesData);
  const byMethod   = salesByMethod(salesData);
  const totalSales = sumSales(salesData);          // todas las ventas (para el gráfico por método)
  const totalReal  = sumRealIncome(salesData);     // solo ingresos reales (fiado cobrado + efectivo/tarjeta/transf)
  const totalFiadoPendiente = byMethod.fiado - salesData.filter(v => v.esVentaFiada && v.estadoCobro === "cobrado").reduce((s,v) => s + (Number(v.total)||0), 0);
  const avgTicket  = salesData.filter(v => !(v.esVentaFiada && v.estadoCobro !== "cobrado")).length > 0
    ? totalReal / salesData.filter(v => !(v.esVentaFiada && v.estadoCobro !== "cobrado")).length
    : 0;
  const topProds   = getTopProducts(salesData, 6);

  const lowStock  = products.filter((p) => p.stock > 0  && p.stock <= 5);
  const outStock  = products.filter((p) => p.stock === 0);

  const kpis = [
    { label: "Ingresos Reales",  value: formatCurrency(totalReal),                icon: DollarSign,   color: "orange", sub: `${salesData.filter(v => !(v.esVentaFiada && v.estadoCobro !== "cobrado")).length} transacciones cobradas` },
    { label: "Ticket Promedio",  value: formatCurrency(avgTicket),                 icon: TrendingUp,   color: "blue",   sub: "Por venta cobrada" },
    { label: "Fiado Pendiente",  value: formatCurrency(byMethod.fiado - salesData.filter(v => v.esVentaFiada && v.estadoCobro === "cobrado").reduce((s,v) => s+(Number(v.total)||0),0)), icon: Clock, color: "amber", sub: "Pendiente de cobro" },
    { label: "Sin Stock",        value: outStock.length,                            icon: Package,      color: "red",    sub: "Agotados" },
  ];

  const colorMap = {
    orange: { bg: "bg-orange-500/10", border: "border-orange-500/20", icon: "text-orange-400", text: "text-orange-400" },
    blue:   { bg: "bg-blue-500/10",   border: "border-blue-500/20",   icon: "text-blue-400",   text: "text-blue-400"   },
    amber:  { bg: "bg-amber-500/10",  border: "border-amber-500/20",  icon: "text-amber-400",  text: "text-amber-400"  },
    red:    { bg: "bg-red-500/10",    border: "border-red-500/20",    icon: "text-red-400",    text: "text-red-400"    },
  };

  const displayLabel = calMode
    ? new Date(selectedDate + "T12:00:00").toLocaleDateString("es-DO", { weekday: "long", year: "numeric", month: "long", day: "numeric" })
    : new Date().toLocaleDateString("es-DO", { weekday: "long", year: "numeric", month: "long", day: "numeric" });

  return (
    <div className="p-4 lg:p-6 max-w-7xl mx-auto space-y-6">
      {/* Header + selectores */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-white font-black text-2xl">Dashboard</h2>
          <p className="text-zinc-500 text-sm mt-0.5 flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5" />{displayLabel}
          </p>
        </div>
        <div className="flex flex-wrap gap-2 items-center">
          {/* Date picker */}
          <div className="flex items-center gap-2 bg-zinc-900 border border-zinc-700 rounded-xl px-3 py-1.5">
            <Calendar className="w-4 h-4 text-zinc-400 shrink-0" />
            <input
              type="date"
              value={selectedDate}
              max={todayStr}
              onChange={(e) => { setSelectedDate(e.target.value); setCalMode(true); }}
              className="bg-transparent text-white text-xs focus:outline-none cursor-pointer"
            />
          </div>
          {/* Período rápido */}
          <div className="flex gap-1">
            {[
              { id: "today", label: "Hoy"      },
              { id: "week",  label: "Semana"    },
              { id: "month", label: "Mes"       },
            ].map(({ id, label }) => (
              <button
                key={id} onClick={() => { setPeriod(id); setCalMode(false); setSelectedDate(todayStr); }}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                  !calMode && period === id ? "bg-orange-500 text-white" : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700"
                }`}
              >{label}</button>
            ))}
          </div>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-4">
        {kpis.map(({ label, value, icon: Icon, color, sub }) => {
          const c = colorMap[color];
          return (
            <div key={label} className={`bg-zinc-900/60 border rounded-2xl p-4 lg:p-5 ${c.border}`}>
              <div className="flex items-start justify-between mb-3">
                <div className={`w-10 h-10 rounded-xl ${c.bg} border ${c.border} flex items-center justify-center`}>
                  <Icon className={`w-5 h-5 ${c.icon}`} />
                </div>
                <ArrowUpRight className="w-4 h-4 text-zinc-700" />
              </div>
              <p className={`text-2xl lg:text-3xl font-black ${c.text} leading-none mb-1`}>{value}</p>
              <p className="text-white font-semibold text-sm">{label}</p>
              <p className="text-zinc-600 text-xs mt-0.5">{sub}</p>
            </div>
          );
        })}
      </div>

      {/* Gráfica + Métodos de pago */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 bg-zinc-900/60 border border-zinc-800/60 rounded-2xl p-4">
          <div className="flex items-center gap-2 mb-4">
            <Activity className="w-4 h-4 text-orange-400" />
            <span className="text-white font-bold text-sm">Ventas por día</span>
            {loading && <RefreshCw className="w-3 h-3 text-zinc-500 animate-spin ml-auto" />}
          </div>
          <BarChartSVG data={chartData} />
        </div>

        <div className="bg-zinc-900/60 border border-zinc-800/60 rounded-2xl p-4">
          <div className="flex items-center gap-2 mb-4">
            <Tag className="w-4 h-4 text-orange-400" />
            <span className="text-white font-bold text-sm">Por método de pago</span>
          </div>
          {totalSales === 0 ? (
            <div className="flex items-center justify-center h-32 text-zinc-700 text-sm">Sin datos</div>
          ) : (
            <div className="space-y-3 mt-2">
              {[
                { label: "Efectivo",      value: byMethod.efectivo,      color: "#22c55e" },
                { label: "Tarjeta",       value: byMethod.tarjeta,       color: "#3b82f6" },
                { label: "Transferencia", value: byMethod.transferencia,  color: "#a855f7" },
                { label: "Fiado",         value: byMethod.fiado,         color: "#f59e0b" },
              ].map(({ label, value, color }) => {
                const pct = totalSales > 0 ? Math.round((value / totalSales) * 100) : 0;
                return (
                  <div key={label}>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-zinc-400">{label}</span>
                      <span className="text-white font-semibold">{formatCurrency(value)}</span>
                    </div>
                    <div className="h-2 bg-zinc-800 rounded-full overflow-hidden">
                      <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, background: color }} />
                    </div>
                    <p className="text-zinc-600 text-[10px] mt-0.5">{pct}% del total</p>
                  </div>
                );
              })}
            </div>
          )}
          <div className="border-t border-zinc-800/60 mt-4 pt-3 space-y-1">
            <div className="flex justify-between">
              <span className="text-zinc-400 text-xs">Total período (bruto)</span>
              <span className="text-zinc-400 text-xs font-semibold">{formatCurrency(totalSales)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-zinc-400 text-xs">Ingresos reales cobrados</span>
              <span className="text-orange-400 font-black text-sm">{formatCurrency(totalReal)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Top productos + ventas recientes */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Top productos */}
        <div className="bg-zinc-900/60 border border-zinc-800/60 rounded-2xl overflow-hidden">
          <div className="px-4 py-3 border-b border-zinc-800/60 flex items-center gap-2">
            <Flame className="w-4 h-4 text-orange-400" />
            <span className="text-white font-bold text-sm">Productos más vendidos</span>
          </div>
          <div className="divide-y divide-zinc-800/40">
            {topProds.length === 0 ? (
              <p className="text-zinc-600 text-sm text-center py-8">Sin datos</p>
            ) : topProds.map((p, i) => (
              <div key={p.productId} className="px-4 py-3 flex items-center gap-3 hover:bg-zinc-800/20 transition-colors">
                <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-black shrink-0 ${i === 0 ? "bg-orange-500/30 text-orange-400" : i === 1 ? "bg-zinc-600/50 text-zinc-400" : "bg-zinc-800 text-zinc-500"}`}>{i+1}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-white text-sm font-medium truncate">{p.productName}</p>
                  <p className="text-zinc-500 text-xs">{p.marca}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-orange-400 font-bold text-sm">{formatCurrency(p.totalRD)}</p>
                  <p className="text-zinc-600 text-xs">{p.totalQty > 0 ? `${p.totalQty} ud.` : `${p.totalML}ml`}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Ventas recientes */}
        <div className="bg-zinc-900/60 border border-zinc-800/60 rounded-2xl overflow-hidden">
          <div className="px-4 py-3 border-b border-zinc-800/60 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ShoppingBag className="w-4 h-4 text-orange-400" />
              <span className="text-white font-bold text-sm">Ventas recientes</span>
            </div>
            <span className="text-zinc-500 text-xs">{salesToday.length} hoy</span>
          </div>
          <div className="divide-y divide-zinc-800/40">
            {salesToday.length === 0 ? (
              <p className="text-zinc-600 text-sm text-center py-8">Sin ventas hoy</p>
            ) : (
              salesToday.slice(0, 8).map((sale) => (
                <div key={sale.id} className="px-4 py-3 flex items-center justify-between hover:bg-zinc-800/20 transition-colors">
                  <div>
                    <p className="text-white text-sm font-medium flex items-center gap-1.5">
                      {sale.items?.length} ítem{sale.items?.length !== 1 ? "s" : ""}
                      {sale.esVentaFiada && <span className="text-[10px] bg-amber-500/20 text-amber-400 border border-amber-500/20 px-1.5 py-0.5 rounded-full">Fiado</span>}
                    </p>
                    <p className="text-zinc-500 text-xs capitalize">{sale.metodoPago} · {sale.cajero?.split("@")[0]}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-orange-400 font-bold">{formatCurrency(sale.total)}</p>
                    <p className="text-zinc-600 text-xs">
                      {sale.fecha?.toDate?.()?.toLocaleTimeString("es-DO", { hour: "2-digit", minute: "2-digit" })}
                    </p>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// FIADO VIEW — Cuentas por Cobrar
// ============================================================
function FiadoView() {
  const [fiados,   setFiados]   = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [marking,  setMarking]  = useState(null);
  const [search,   setSearch]   = useState("");

  const load = async () => {
    setLoading(true);
    try {
      const data = await getVentasFiadoPendientes();
      setFiados(data);
    } catch(err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handleCobrar = async (id) => {
    if (!window.confirm("¿Marcar esta deuda como cobrada?")) return;
    setMarking(id);
    try {
      await marcarFiadoCobrado(id);
      setFiados((prev) => prev.filter((f) => f.id !== id));
    } catch(err) { alert("Error: " + err.message); }
    finally { setMarking(null); }
  };

  const totalPendiente = fiados.reduce((s, f) => s + (Number(f.total)||0), 0);

  const filtered = fiados.filter((f) =>
    (f.clienteNombre || "").toLowerCase().includes(search.toLowerCase()) ||
    (f.clienteTelefono || "").includes(search)
  );

  return (
    <div className="p-4 lg:p-6 max-w-5xl mx-auto space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-white font-black text-2xl flex items-center gap-2">
            <Clock className="w-6 h-6 text-amber-400" /> Cuentas por Cobrar
          </h2>
          <p className="text-zinc-500 text-sm mt-0.5">{fiados.length} deudas pendientes</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="bg-amber-500/10 border border-amber-500/25 rounded-xl px-4 py-2.5 text-center">
            <p className="text-xs text-amber-400 font-semibold uppercase tracking-wider">Total Pendiente</p>
            <p className="text-amber-400 font-black text-xl">{formatCurrency(totalPendiente)}</p>
          </div>
          <button onClick={load} className="bg-zinc-800 hover:bg-zinc-700 text-zinc-400 p-2.5 rounded-xl transition-colors">
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Búsqueda */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
        <input
          type="text" value={search} onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por nombre o teléfono..."
          className="w-full bg-zinc-900 border border-zinc-800 text-white placeholder-zinc-600 rounded-xl pl-10 pr-4 py-2.5 text-sm focus:outline-none focus:border-amber-500/50 transition-all"
        />
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><RefreshCw className="w-6 h-6 text-amber-400 animate-spin" /></div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center py-16 gap-3">
          <Check className="w-12 h-12 text-emerald-400 opacity-50" />
          <p className="text-zinc-500 text-sm">{search ? "Sin resultados" : "¡No hay deudas pendientes! 🎉"}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((f) => {
            const fecha = f.fecha?.toDate?.() ?? new Date(f.fechaISO);
            return (
              <div key={f.id} className="bg-zinc-900/60 border border-amber-500/20 rounded-2xl p-4 hover:border-amber-500/40 transition-all">
                <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                  {/* Info cliente */}
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <div className="w-10 h-10 rounded-full bg-amber-500/15 border border-amber-500/25 flex items-center justify-center shrink-0">
                      <User className="w-5 h-5 text-amber-400" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-white font-bold truncate">{f.clienteNombre || "—"}</p>
                      <p className="text-zinc-400 text-sm">{f.clienteTelefono || "Sin teléfono"}</p>
                    </div>
                  </div>

                  {/* Productos */}
                  <div className="flex-1 min-w-0">
                    <p className="text-zinc-400 text-xs font-semibold mb-1 uppercase tracking-wider">Productos fiados</p>
                    <div className="space-y-0.5">
                      {(f.items || []).slice(0, 3).map((item, i) => (
                        <p key={i} className="text-zinc-300 text-xs truncate">
                          {item.esLiquidoDetallado
                            ? `${item.productName} (${item.mlAmount}ml) — ${formatCurrency(item.montoRD)}`
                            : `${item.quantity}× ${item.productName} — ${formatCurrency(item.subtotal)}`}
                        </p>
                      ))}
                      {(f.items||[]).length > 3 && <p className="text-zinc-600 text-xs">+{f.items.length-3} más...</p>}
                    </div>
                  </div>

                  {/* Total + acción */}
                  <div className="flex items-center gap-3 sm:flex-col sm:items-end">
                    <div className="text-right">
                      <p className="text-amber-400 font-black text-xl">{formatCurrency(f.total)}</p>
                      <p className="text-zinc-600 text-xs">
                        {fecha.toLocaleDateString("es-DO", { day: "2-digit", month: "short" })} · {fecha.toLocaleTimeString("es-DO", { hour:"2-digit", minute:"2-digit" })}
                      </p>
                    </div>
                    <button
                      onClick={() => handleCobrar(f.id)}
                      disabled={marking === f.id}
                      className="bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/30 hover:border-emerald-500/60 text-emerald-400 font-bold px-4 py-2 rounded-xl text-sm transition-all flex items-center gap-2 disabled:opacity-50 shrink-0"
                    >
                      {marking === f.id ? <RefreshCw className="w-4 h-4 animate-spin" /> : <><Check className="w-4 h-4" /> Cobrado</>}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Gráfica de barras SVG pura ────────────────────────────
function BarChartSVG({ data }) {
  if (!data || data.length === 0) {
    return (
      <div className="flex items-center justify-center h-40 text-zinc-700 text-sm">
        Sin datos para este período
      </div>
    );
  }

  const W = 600, H = 180, PAD_L = 60, PAD_B = 32, PAD_T = 10, PAD_R = 10;
  const chartW = W - PAD_L - PAD_R;
  const chartH = H - PAD_B - PAD_T;

  const maxVal = Math.max(...data.map((d) => d.total), 1);
  const barW   = Math.min(40, (chartW / data.length) * 0.6);
  const gap    = chartW / data.length;

  // Líneas guía horizontales
  const guides = [0, 0.25, 0.5, 0.75, 1].map((f) => ({
    y:     PAD_T + chartH * (1 - f),
    label: formatCurrency(maxVal * f),
  }));

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto" }}>
      {/* Líneas guía */}
      {guides.map(({ y, label }) => (
        <g key={y}>
          <line x1={PAD_L} y1={y} x2={W - PAD_R} y2={y} stroke="#27272a" strokeWidth="1" />
          <text x={PAD_L - 6} y={y + 4} fontSize="9" fill="#52525b" textAnchor="end">{label}</text>
        </g>
      ))}

      {/* Barras */}
      {data.map((d, i) => {
        const barH = Math.max(2, (d.total / maxVal) * chartH);
        const x    = PAD_L + gap * i + gap / 2 - barW / 2;
        const y    = PAD_T + chartH - barH;
        const label = d.fecha.slice(5); // MM-DD

        return (
          <g key={d.fecha}>
            {/* Barra con gradiente naranja */}
            <defs>
              <linearGradient id={`bar-${i}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%"   stopColor="#f97316" />
                <stop offset="100%" stopColor="#c2410c" />
              </linearGradient>
            </defs>
            <rect
              x={x} y={y} width={barW} height={barH}
              fill={`url(#bar-${i})`} rx="4"
              style={{ opacity: 0.9 }}
            />
            {/* Valor encima */}
            {d.total > 0 && (
              <text x={x + barW / 2} y={y - 4} fontSize="8" fill="#fb923c" textAnchor="middle">
                {d.total >= 1000 ? `${(d.total / 1000).toFixed(1)}k` : d.total}
              </text>
            )}
            {/* Etiqueta de fecha */}
            <text x={x + barW / 2} y={H - 4} fontSize="9" fill="#71717a" textAnchor="middle">{label}</text>
          </g>
        );
      })}
    </svg>
  );
}

// ============================================================
// INVENTORY VIEW — CRUD con Base64 para imágenes
// ============================================================
const EMPTY_PRODUCT = {
  nombre: "", marca: "", categoria: "Desechables",
  precio: "", stock: "", descripcion: "", niveles_nicotina: [],
  imageBase64: "", imageUrl: "",
  precioPorMl: "", stockMl: "",
  ml_por_botella: "", cantidad_botellas: "", stock_botellas: "",
  precio_costo_botella: "",
  precio_botella: "",
};

function InventoryView({ products }) {
  const [search,       setSearch]       = useState("");
  const [showForm,     setShowForm]     = useState(false);
  const [formProduct,  setFormProduct]  = useState(null);
  const [form,         setForm]         = useState(EMPTY_PRODUCT);
  const [nicInput,     setNicInput]     = useState("");
  const [saving,       setSaving]       = useState(false);
  const [saveError,    setSaveError]    = useState("");
  const [imgPreview,   setImgPreview]   = useState("");
  const [imgError,     setImgError]     = useState("");
  const fileInputRef = useRef(null);

  const filtered = products.filter(
    (p) =>
      p.nombre?.toLowerCase().includes(search.toLowerCase()) ||
      p.marca?.toLowerCase().includes(search.toLowerCase())
  );

  // ── Abrir formulario ──
  const openNew = () => {
    setFormProduct(null);
    setForm(EMPTY_PRODUCT);
    setNicInput("");
    setImgPreview("");
    setImgError("");
    setSaveError("");
    setShowForm(true);
  };

  const openEdit = (p) => {
    setFormProduct(p);
    setForm({
      nombre:           p.nombre || "",
      marca:            p.marca  || "",
      categoria:        p.categoria || "Desechables",
      precio:           String(p.precio || ""),
      stock:            String(p.stock  || ""),
      descripcion:      p.descripcion || "",
      niveles_nicotina: p.niveles_nicotina || [],
      imageBase64:      p.imageBase64 || "",
      imageUrl:         p.imageUrl    || "",
      precioPorMl:      String(p.precioPorMl || ""),
      stockMl:          String(p.stockMl     || ""),
      ml_por_botella:   String(p.ml_por_botella || ""),
      cantidad_botellas: String(p.cantidad_botellas || ""),
      stock_botellas:   String(p.stock_botellas ?? p.cantidad_botellas ?? ""),
      precio_costo_botella: String(p.precio_costo_botella || ""),
      precio_botella:       String(p.precio_botella || ""),
    });
    setImgPreview(p.imageBase64 || p.imageUrl || "");
    setImgError("");
    setSaveError("");
    setNicInput("");
    setShowForm(true);
  };

  const closeForm = () => { setShowForm(false); setSaveError(""); };

  // ── Manejo de imagen Base64 ──
  const handleImageFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 1_500_000) {
      setImgError("La imagen debe pesar menos de 1.5 MB.");
      return;
    }
    setImgError("");
    try {
      const base64 = await fileToBase64(file);
      setForm((f) => ({ ...f, imageBase64: base64, imageUrl: "" }));
      setImgPreview(base64);
    } catch {
      setImgError("No se pudo leer la imagen.");
    }
  };

  // ── Guardar producto (nuevo o edición) — retorna success ──
  const handleSave = async () => {
    const isLiquido = form.categoria === "Líquidos";
    if (!form.nombre) return;
    if (!isLiquido && !form.precio) return;
    setSaving(true);
    setSaveError("");
    try {
      let result;
      if (formProduct) {
        result = await updateProduct(formProduct.id, form);
      } else {
        result = await addProduct(form);
      }
      // El modal se cierra solo si result.success === true
      if (result.success) {
        closeForm();   // ← cierra y resetea
      }
    } catch (err) {
      setSaveError(err.message || "Error al guardar el producto.");
    } finally {
      setSaving(false);
    }
  };

  // ── Eliminar ──
  const handleDelete = async (id) => {
    if (!window.confirm("¿Eliminar este producto?")) return;
    try {
      await deleteProduct(id);
    } catch (err) {
      alert("Error al eliminar: " + err.message);
    }
  };

  // ── Chips nicotina ──
  const addNicChip = () => {
    const v = nicInput.trim();
    if (v && !form.niveles_nicotina.includes(v))
      setForm((f) => ({ ...f, niveles_nicotina: [...f.niveles_nicotina, v] }));
    setNicInput("");
  };
  const removeNicChip = (n) =>
    setForm((f) => ({ ...f, niveles_nicotina: f.niveles_nicotina.filter((x) => x !== n) }));

  return (
    <div className="p-4 lg:p-6 max-w-7xl mx-auto space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-white font-black text-2xl">Inventario</h2>
          <p className="text-zinc-500 text-sm mt-0.5">{products.length} productos registrados</p>
        </div>
        <button
          onClick={openNew}
          className="flex items-center gap-2 bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-400 hover:to-orange-500 text-white font-bold px-4 py-2.5 rounded-xl text-sm transition-all shadow-lg shadow-orange-500/25 hover:-translate-y-0.5"
        >
          <Plus className="w-4 h-4" /> Agregar Producto
        </button>
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
        <input
          type="text" value={search} onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar producto..."
          className="w-full bg-zinc-900 border border-zinc-800 text-white placeholder-zinc-600 rounded-xl pl-10 pr-4 py-2.5 text-sm focus:outline-none focus:border-orange-500/60 transition-all"
        />
      </div>

      {/* Tabla */}
      <div className="bg-zinc-900/60 border border-zinc-800/60 rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-800/60">
                {["", "Producto", "Marca", "Categoría", "Precio", "Stock", "Nicotina", "Estado", "Acciones"].map((h) => (
                  <th key={h} className="text-left text-zinc-500 text-xs font-semibold uppercase tracking-wider px-4 py-3">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/30">
              {filtered.length === 0 ? (
                <tr><td colSpan={9} className="text-center text-zinc-600 py-12 text-sm">No hay productos. ¡Agrega el primero!</td></tr>
              ) : (
                filtered.map((p) => {
                  const src          = imgSrc(p);
                  const isDetallado  = p.categoria === "Líquidos";
                  const stockDisplay = isDetallado
                    ? (p.total_ml_disponibles ?? p.stockMl ?? 0)
                    : p.stock;
                  const stockOk      = stockDisplay > 5;
                  const stockLow     = stockDisplay > 0 && stockDisplay <= 5;

                  return (
                    <tr key={p.id} className="hover:bg-zinc-800/20 transition-colors">
                      <td className="px-3 py-2 w-12">
                        {src ? (
                          <img src={src} alt={p.nombre} className="w-10 h-10 rounded-full object-cover border border-zinc-700" onError={(e) => e.target.style.display = "none"} />
                        ) : (
                          <div className="w-10 h-10 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center">
                            <Package className="w-4 h-4 text-zinc-600" />
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-white font-medium">{p.nombre}</td>
                      <td className="px-4 py-3 text-zinc-400">{p.marca}</td>
                      <td className="px-4 py-3">
                        <span className="bg-zinc-800 text-zinc-300 text-xs px-2 py-0.5 rounded-full">{p.categoria}</span>
                      </td>
                      <td className="px-4 py-3 text-orange-400 font-bold">
                        {isDetallado
                          ? formatCurrency(
                              parseFloat(p.precio_venta_botella) ||
                              parseFloat(p.precio_botella)        ||
                              0
                            )
                          : formatCurrency(p.precio)}
                      </td>
                      <td className="px-4 py-3 text-white font-semibold">
                        {isDetallado ? (
                          <span className="flex flex-col gap-0.5">
                            <span className="text-cyan-400 font-bold text-sm">{p.total_ml_disponibles ?? p.stockMl ?? 0} ml</span>
                            <span className="text-[10px] text-zinc-500">🍾 {p.stock_botellas ?? 0} botellas</span>
                            <span className="text-[10px] text-zinc-600">{formatCurrency(p.precioPorMl || 0)}/ml</span>
                          </span>
                        ) : p.stock}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1">
                          {(p.niveles_nicotina || []).slice(0, 3).map((n) => (
                            <span key={n} className="text-[10px] bg-zinc-800 text-zinc-400 px-1.5 py-0.5 rounded-full">{n}</span>
                          ))}
                          {(p.niveles_nicotina || []).length > 3 && (
                            <span className="text-[10px] text-zinc-600">+{p.niveles_nicotina.length - 3}</span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${
                          stockDisplay === 0
                            ? "bg-red-500/15 text-red-400 border border-red-500/20"
                            : stockLow
                            ? "bg-yellow-500/15 text-yellow-400 border border-yellow-500/20"
                            : "bg-emerald-500/15 text-emerald-400 border border-emerald-500/20"
                        }`}>
                          {stockDisplay === 0 ? "Agotado" : stockLow ? "Bajo" : "OK"}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <button onClick={() => openEdit(p)} className="text-xs text-zinc-500 hover:text-orange-400 border border-zinc-700 hover:border-orange-500/40 px-2.5 py-1 rounded-lg transition-all flex items-center gap-1">
                            <Layers className="w-3 h-3" /> Editar
                          </button>
                          <button onClick={() => handleDelete(p.id)} className="text-xs text-zinc-600 hover:text-red-400 border border-zinc-800 hover:border-red-500/30 px-2 py-1 rounded-lg transition-all">
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── MODAL: Agregar / Editar Producto ── */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={closeForm}>
          <div className="absolute inset-0 bg-black/75 backdrop-blur-sm" />
          <div
            className="relative bg-[#1a1a1a] border border-zinc-700/60 rounded-2xl p-6 w-full max-w-lg shadow-2xl max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Cabecera del form */}
            <div className="flex items-center justify-between mb-6">
              <div>
                <h3 className="text-white font-black text-xl">{formProduct ? "Editar Producto" : "Nuevo Producto"}</h3>
                <p className="text-zinc-500 text-xs mt-0.5">{formProduct ? "Modifica los datos" : "Completa la información"}</p>
              </div>
              <button onClick={closeForm} className="text-zinc-500 hover:text-white"><X className="w-5 h-5" /></button>
            </div>

            <div className="space-y-4">
              {/* Nombre + Marca */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-zinc-400 text-xs font-semibold uppercase tracking-wider block mb-1.5">Nombre <span className="text-orange-500">*</span></label>
                  <input type="text" value={form.nombre} onChange={(e) => setForm((f) => ({ ...f, nombre: e.target.value }))} placeholder="Ej: Vuse Go 700"
                    className="w-full bg-zinc-900 border border-zinc-700 text-white placeholder-zinc-600 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-orange-500/60 transition-all" />
                </div>
                <div>
                  <label className="text-zinc-400 text-xs font-semibold uppercase tracking-wider block mb-1.5">Marca</label>
                  <input type="text" value={form.marca} onChange={(e) => setForm((f) => ({ ...f, marca: e.target.value }))} placeholder="Ej: Vuse"
                    className="w-full bg-zinc-900 border border-zinc-700 text-white placeholder-zinc-600 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-orange-500/60 transition-all" />
                </div>
              </div>

              {/* ── INPUT DE IMAGEN BASE64 ── */}
              <div>
                <label className="text-zinc-400 text-xs font-semibold uppercase tracking-wider block mb-1.5 flex items-center gap-1.5">
                  <Image className="w-3.5 h-3.5" /> Imagen del Producto
                </label>
                <div
                  className="border-2 border-dashed border-zinc-700 hover:border-orange-500/50 rounded-xl p-4 cursor-pointer transition-all flex flex-col items-center gap-2 text-center"
                  onClick={() => fileInputRef.current?.click()}
                >
                  {imgPreview ? (
                    <img src={imgPreview} alt="preview" className="w-24 h-24 object-cover rounded-xl border border-zinc-600" />
                  ) : (
                    <>
                      <div className="w-10 h-10 rounded-xl bg-zinc-800 flex items-center justify-center">
                        <Image className="w-5 h-5 text-zinc-500" />
                      </div>
                      <p className="text-zinc-500 text-xs">Haz clic para subir imagen</p>
                      <p className="text-zinc-700 text-[10px]">PNG, JPG, WEBP · máx 1.5 MB</p>
                    </>
                  )}
                </div>
                <input
                  ref={fileInputRef} type="file" accept="image/*"
                  onChange={handleImageFile} className="hidden"
                />
                {imgPreview && (
                  <button
                    onClick={() => { setForm((f) => ({ ...f, imageBase64: "", imageUrl: "" })); setImgPreview(""); }}
                    className="mt-1.5 text-xs text-zinc-600 hover:text-red-400 transition-colors"
                  >
                    × Quitar imagen
                  </button>
                )}
                {imgError && <p className="text-red-400 text-xs mt-1">{imgError}</p>}
              </div>

              {/* Categoría */}
              <div>
                <label className="text-zinc-400 text-xs font-semibold uppercase tracking-wider block mb-1.5">Categoría</label>
                <div className="flex flex-wrap gap-2">
                  {CATS_FORM.map((c) => (
                    <button
                      key={c} type="button" onClick={() => setForm((f) => ({ ...f, categoria: c }))}
                      className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-all ${
                        form.categoria === c ? "bg-orange-500 text-white shadow-lg shadow-orange-500/25" : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700"
                      }`}
                    >{c}</button>
                  ))}
                </div>
              </div>

              {/* ── Campos Líquidos (siempre detallado) ── */}
              {form.categoria === "Líquidos" && (
                <div className="bg-cyan-500/5 border border-cyan-500/20 rounded-xl p-4 space-y-3">
                  <p className="text-cyan-400 text-xs font-semibold uppercase tracking-wider flex items-center gap-1.5">
                    💧 Configuración del Líquido
                  </p>

                  {/* ML por botella */}
                  <div>
                    <label className="text-zinc-400 text-xs font-semibold uppercase tracking-wider block mb-1.5">
                      ML por botella <span className="text-cyan-500">*</span>
                    </label>
                    <input type="number" value={form.ml_por_botella}
                      onChange={(e) => {
                        const ml = e.target.value;
                        const bots = parseFloat(form.stock_botellas || form.cantidad_botellas) || 0;
                        const total = (parseFloat(ml) || 0) * bots;
                        setForm((f) => ({ ...f, ml_por_botella: ml, stockMl: total > 0 ? String(total) : f.stockMl }));
                      }}
                      placeholder="Ej: 30" min="0"
                      className="w-full bg-zinc-900 border border-cyan-700/50 text-white placeholder-zinc-600 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-cyan-500/60 transition-all" />
                  </div>

                  {/* Cantidad de botellas */}
                  <div>
                    <label className="text-zinc-400 text-xs font-semibold uppercase tracking-wider block mb-1.5">
                      Cantidad de botellas <span className="text-cyan-500">*</span>
                    </label>
                    <input type="number" value={form.stock_botellas || form.cantidad_botellas}
                      onChange={(e) => {
                        const bots = e.target.value;
                        const ml = parseFloat(form.ml_por_botella) || 0;
                        const total = ml * (parseFloat(bots) || 0);
                        setForm((f) => ({ ...f, stock_botellas: bots, cantidad_botellas: bots, stockMl: total > 0 ? String(total) : f.stockMl }));
                      }}
                      placeholder="Ej: 10" min="0"
                      className="w-full bg-zinc-900 border border-cyan-700/50 text-white placeholder-zinc-600 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-cyan-500/60 transition-all" />
                  </div>

                  {/* Auto-cálculo stock_total_ml */}
                  {parseFloat(form.ml_por_botella) > 0 && parseFloat(form.stock_botellas || form.cantidad_botellas) > 0 && (
                    <div className="flex items-center gap-2 bg-cyan-500/10 border border-cyan-500/20 rounded-lg px-3 py-2">
                      <span className="text-cyan-400 text-xs">= stock_total_ml:</span>
                      <span className="text-cyan-300 font-black text-sm">
                        {(parseFloat(form.ml_por_botella) * parseFloat(form.stock_botellas || form.cantidad_botellas)).toFixed(0)} ML
                      </span>
                    </div>
                  )}

                  {/* Precio costo por botella */}
                  <div>
                    <label className="text-zinc-400 text-xs font-semibold uppercase tracking-wider block mb-1.5">
                      Precio costo / botella (RD$)
                    </label>
                    <input type="number" value={form.precio_costo_botella}
                      onChange={(e) => setForm((f) => ({ ...f, precio_costo_botella: e.target.value }))}
                      placeholder="Ej: 150.00" min="0" step="0.01"
                      className="w-full bg-zinc-900 border border-cyan-700/50 text-white placeholder-zinc-600 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-cyan-500/60 transition-all" />
                    <p className="text-zinc-600 text-[10px] mt-1">Costo interno de compra (referencia).</p>
                  </div>

                  {/* Precio de venta por botella cerrada */}
                  <div>
                    <label className="text-zinc-400 text-xs font-semibold uppercase tracking-wider block mb-1.5">
                      Precio venta botella cerrada (RD$) <span className="text-cyan-500">*</span>
                    </label>
                    <input type="number" value={form.precio_botella}
                      onChange={(e) => setForm((f) => ({ ...f, precio_botella: e.target.value }))}
                      placeholder="Ej: 250.00" min="0" step="0.01"
                      className="w-full bg-zinc-900 border border-orange-500/40 text-white placeholder-zinc-600 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-orange-500/60 transition-all" />
                    <p className="text-zinc-600 text-[10px] mt-1">Lo que cobra el POS al vender botella cerrada.</p>
                  </div>
                </div>
              )}


              {/* Precio + Stock — OCULTO para Líquidos (usan campos propios de líquido) */}
              {form.categoria !== "Líquidos" && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-zinc-400 text-xs font-semibold uppercase tracking-wider block mb-1.5">Precio (RD$) <span className="text-orange-500">*</span></label>
                    <input type="number" value={form.precio} onChange={(e) => setForm((f) => ({ ...f, precio: e.target.value }))} placeholder="0.00" min="0"
                      className="w-full bg-zinc-900 border border-zinc-700 text-white placeholder-zinc-600 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-orange-500/60 transition-all" />
                  </div>
                  <div>
                    <label className="text-zinc-400 text-xs font-semibold uppercase tracking-wider block mb-1.5">Stock inicial</label>
                    <input type="number" value={form.stock} onChange={(e) => setForm((f) => ({ ...f, stock: e.target.value }))} placeholder="0" min="0"
                      className="w-full bg-zinc-900 border border-zinc-700 text-white placeholder-zinc-600 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-orange-500/60 transition-all" />
                  </div>
                </div>
              )}

              {/* Descripción */}
              <div>
                <label className="text-zinc-400 text-xs font-semibold uppercase tracking-wider block mb-1.5">Descripción</label>
                <textarea value={form.descripcion} onChange={(e) => setForm((f) => ({ ...f, descripcion: e.target.value }))}
                  placeholder="Descripción opcional..." rows={2}
                  className="w-full bg-zinc-900 border border-zinc-700 text-white placeholder-zinc-600 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-orange-500/60 transition-all resize-none"
                />
              </div>

              {/* Niveles de nicotina */}
              <div>
                <label className="text-zinc-400 text-xs font-semibold uppercase tracking-wider block mb-1.5">Niveles de Nicotina</label>
                <div className="flex gap-2 mb-2">
                  <input
                    type="text" value={nicInput} onChange={(e) => setNicInput(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addNicChip())}
                    placeholder="Ej: 3mg, 50mg, FREE..."
                    className="flex-1 bg-zinc-900 border border-zinc-700 text-white placeholder-zinc-600 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-orange-500/60 transition-all"
                  />
                  <button type="button" onClick={addNicChip} className="bg-zinc-800 hover:bg-zinc-700 text-zinc-300 px-3 py-2 rounded-xl text-sm transition-colors">
                    <Plus className="w-4 h-4" />
                  </button>
                </div>
                {/* Chips rápidos */}
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {NICOTINE_LEVELS.map((n) => (
                    <button
                      key={n} type="button"
                      onClick={() => !form.niveles_nicotina.includes(n) && setForm((f) => ({ ...f, niveles_nicotina: [...f.niveles_nicotina, n] }))}
                      className={`text-[11px] px-2 py-0.5 rounded-full border transition-all ${
                        form.niveles_nicotina.includes(n)
                          ? "bg-orange-500/20 border-orange-500/40 text-orange-400"
                          : "bg-zinc-900 border-zinc-700 text-zinc-500 hover:border-zinc-500"
                      }`}
                    >{n}</button>
                  ))}
                </div>
                {form.niveles_nicotina.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 p-2.5 bg-zinc-900/60 rounded-xl border border-zinc-800">
                    {form.niveles_nicotina.map((n) => (
                      <span key={n} className="flex items-center gap-1 text-xs bg-orange-500/15 text-orange-400 border border-orange-500/25 px-2 py-0.5 rounded-full">
                        {n}
                        <button onClick={() => removeNicChip(n)} className="hover:text-red-400 transition-colors"><X className="w-3 h-3" /></button>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Error al guardar */}
            {saveError && (
              <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 mt-4">
                <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
                <p className="text-red-400 text-sm">{saveError}</p>
              </div>
            )}

            {/* Botones */}
            <div className="flex gap-3 mt-6">
              <button onClick={closeForm} className="flex-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-semibold rounded-xl py-3 text-sm transition-colors">Cancelar</button>
              <button
                onClick={handleSave}
                disabled={saving || !form.nombre || (form.categoria !== "Líquidos" && !form.precio)}
                className="flex-1 bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-400 hover:to-orange-500 disabled:opacity-40 text-white font-bold rounded-xl py-3 text-sm transition-all shadow-lg shadow-orange-500/25 flex items-center justify-center gap-2"
              >
                {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <><Check className="w-4 h-4" />{formProduct ? "Guardar Cambios" : "Crear Producto"}</>}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
