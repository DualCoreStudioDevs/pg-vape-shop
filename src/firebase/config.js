// src/firebase/config.js
// ─────────────────────────────────────────────────────────────
// Configuración de Firebase + schema de Firestore comentado
// ─────────────────────────────────────────────────────────────
//
// SCHEMA FIRESTORE
//
// Colección: products
// {
//   id:        string   (auto, también guardado como campo)
//   name:      string   ej. "Elf Bar 5000"
//   brand:     string   ej. "Elf Bar"
//   category:  string   ej. "Desechable" | "Pod" | "Líquido" | "Accesorio"
//   basePrice: number   precio en RD$
//   createdAt: Timestamp
//   updatedAt: Timestamp
//   variants: [
//     {
//       id:      string  ej. "var_1714000000000"
//       flavor:  string  ej. "Watermelon Ice"
//       nicotine:string  ej. "50mg"
//       stock:   number  unidades disponibles
//       sku:     string  código interno (opcional)
//     }
//   ]
// }
//
// Colección: sales
// {
//   id:            string   (auto)
//   total:         number
//   paymentMethod: "cash" | "transfer"
//   cashierNote:   string | null
//   createdAt:     Timestamp
//   items: [
//     {
//       productId:   string
//       productName: string
//       variantId:   string
//       flavor:      string
//       nicotine:    string
//       quantity:    number
//       unitPrice:   number
//       subtotal:    number
//     }
//   ]
// }
// ─────────────────────────────────────────────────────────────

import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyB9kvPUvn0x-zHWgnHrsKhlwq_HKcBCiR4",
  authDomain: "pg-vape-shop.firebaseapp.com",
  projectId: "pg-vape-shop",
  storageBucket: "pg-vape-shop.firebasestorage.app",
  messagingSenderId: "611196230742",
  appId: "1:611196230742:web:8dd4322fbf2890b1672ff7"
};

const app = initializeApp(firebaseConfig);

// ✅ Exportar db — esto es lo que faltaba y causaba la pantalla negra
export const db = getFirestore(app);
export default app;
