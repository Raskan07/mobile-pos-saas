import { initializeApp, getApps } from "firebase/app";
import { getFirestore, collection, getDocs, doc, setDoc } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyC5vJg7DiMKAvlLKR4VchHl0ZOxiMetOuM",
  authDomain: "fuel-map-a93a4.firebaseapp.com",
  projectId: "fuel-map-a93a4",
  storageBucket: "fuel-map-a93a4.firebasestorage.app",
  messagingSenderId: "253864258205",
  appId: "1:253864258205:web:6cb4c03a405ad9580f4274",
  measurementId: "G-266FRX1DR9"
};

const app = !getApps().length ? initializeApp(firebaseConfig) : getApps()[0];
const db = getFirestore(app);

async function syncProducts() {
  console.log("Scanning all shops for products to copy into root 'products' collection...");

  const shopsSnap = await getDocs(collection(db, "shops"));
  console.log(`Found ${shopsSnap.size} shops.`);

  let totalSynced = 0;

  for (const shopDoc of shopsSnap.docs) {
    const shopId = shopDoc.id;
    const prodsSnap = await getDocs(collection(db, "shops", shopId, "products"));
    console.log(`Shop ${shopId}: found ${prodsSnap.size} products.`);

    for (const prodDoc of prodsSnap.docs) {
      const prodData = prodDoc.data();
      const payload = {
        ...prodData,
        id: prodDoc.id,
        shopId: prodData.shopId || shopId,
        updatedAt: prodData.updatedAt || Date.now(),
      };

      // 1. Ensure root collection "products" has this document
      await setDoc(doc(db, "products", prodDoc.id), payload, { merge: true });

      // 2. Ensure shop subcollection also has it
      await setDoc(doc(db, "shops", shopId, "products", prodDoc.id), payload, { merge: true });

      console.log(`  ✓ Synced product: ${prodDoc.id} (${prodData.name}) to root 'products'`);
      totalSynced++;
    }
  }

  // Verify root collection
  const rootSnap = await getDocs(collection(db, "products"));
  console.log(`\nDone! Root 'products' collection now contains ${rootSnap.size} documents.`);
}

syncProducts().then(() => process.exit(0)).catch((err) => {
  console.error("Error syncing products:", err);
  process.exit(1);
});
