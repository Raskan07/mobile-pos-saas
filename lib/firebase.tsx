// Import the functions you need from the SDKs you need
import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyC5vJg7DiMKAvlLKR4VchHl0ZOxiMetOuM",
  authDomain: "fuel-map-a93a4.firebaseapp.com",
  projectId: "fuel-map-a93a4",
  storageBucket: "fuel-map-a93a4.firebasestorage.app",
  messagingSenderId: "253864258205",
  appId: "1:253864258205:web:6cb4c03a405ad9580f4274",
  measurementId: "G-266FRX1DR9"
};

// Initialize primary Firebase App
export const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();

// Initialize Auth & Firestore
export const auth = getAuth(app);
export const db = getFirestore(app);

// Helper to get or create a secondary Firebase Auth instance
// This enables admin to register new staff accounts without logging out their active session
export function getSecondaryAuth() {
  const secondaryAppName = "SecondaryStaffAuthApp";
  const existingApp = getApps().find((a) => a.name === secondaryAppName);
  const secondaryApp = existingApp || initializeApp(firebaseConfig, secondaryAppName);
  return getAuth(secondaryApp);
}