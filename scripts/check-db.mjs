import { initializeApp, getApps } from "firebase/app";
import { getFirestore, collection, getDocs } from "firebase/firestore";

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

async function check() {
  console.log("Checking Firestore collections...");

  // Check subcollections for SHP-4413
  const subcollections = ["products", "categories", "subcategories", "brands", "suppliers", "expenses", "sales"];
  for (const sub of subcollections) {
    try {
      const snap = await getDocs(collection(db, "shops", "SHP-4413", sub));
      console.log(`shops/SHP-4413/${sub}: ${snap.size} documents`);
      if (snap.size > 0) {
        snap.docs.slice(0, 3).forEach(d => console.log(`   - doc: ${d.id}`, d.data().name || d.data().title || d.data()));
      }
    } catch (e) {
      console.log(`shops/SHP-4413/${sub}: error ${e.message}`);
    }
  }

  // Check root products collection
  try {
    const rootSnap = await getDocs(collection(db, "products"));
    console.log(`root products collection: ${rootSnap.size} documents`);
  } catch (e) {
    console.log(`root products collection: error ${e.message}`);
  }
}

check().then(() => process.exit(0)).catch(err => {
  console.error(err);
  process.exit(1);
});
