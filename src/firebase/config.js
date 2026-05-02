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
  apiKey:            import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain:        import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId:         import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket:     import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId:             import.meta.env.VITE_FIREBASE_APP_ID,
};

const app = initializeApp(firebaseConfig);

export const db = getFirestore(app);
export default app;
