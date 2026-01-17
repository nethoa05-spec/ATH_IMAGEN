
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.7.0/firebase-app.js";
import { 
  getAuth, 
  GoogleAuthProvider, 
  signInWithPopup, 
  createUserWithEmailAndPassword, 
  signInWithEmailAndPassword,
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/12.7.0/firebase-auth.js";
import { 
  getFirestore, 
  doc, 
  getDoc, 
  setDoc, 
  updateDoc, 
  increment 
} from "https://www.gstatic.com/firebasejs/12.7.0/firebase-firestore.js";
import { UserProfile } from "../types";

const firebaseConfig = {
  apiKey: "AIzaSyAlG0NkskzEZ76Zp_KcKzYEfzuV9U9iIZM",
  authDomain: "imagen-8e85f.firebaseapp.com",
  projectId: "imagen-8e85f",
  storageBucket: "imagen-8e85f.firebasestorage.app",
  messagingSenderId: "275795034248",
  appId: "1:275795034248:web:08fb98769fa85c6f10df3d",
  measurementId: "G-9WE6QH29E5"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const googleProvider = new GoogleAuthProvider();

export const getUserProfile = async (uid: string): Promise<UserProfile | null> => {
  const docRef = doc(db, "users", uid);
  const docSnap = await getDoc(docRef);
  
  if (docSnap.exists()) {
    const data = docSnap.data() as UserProfile;
    const today = new Date().toISOString().split('T')[0];
    
    // Reset daily used if it's a new day
    if (data.lastUsedDate !== today) {
      await updateDoc(docRef, {
        dailyUsed: 0,
        lastUsedDate: today
      });
      return { ...data, dailyUsed: 0, lastUsedDate: today };
    }
    
    return data;
  }
  return null;
};

export const createUserProfile = async (uid: string, email: string | null): Promise<UserProfile> => {
  const today = new Date().toISOString().split('T')[0];
  const newProfile: UserProfile = {
    uid,
    email,
    createdAt: Date.now(),
    plan: 'free',
    credits: 30,
    dailyLimit: 30,
    dailyUsed: 0,
    lastUsedDate: today,
    expiryDate: null
  };
  
  await setDoc(doc(db, "users", uid), newProfile);
  return newProfile;
};

export const decrementCreditsAndIncrementUsed = async (uid: string, isFreePlan: boolean) => {
  const userRef = doc(db, "users", uid);
  const updates: any = {
    dailyUsed: increment(1)
  };
  
  if (isFreePlan) {
    updates.credits = increment(-1);
  }
  
  await updateDoc(userRef, updates);
};

export const updateUserPlan = async (uid: string, planId: any, limit: number) => {
  const userRef = doc(db, "users", uid);
  const expiry = Date.now() + (30 * 24 * 60 * 60 * 1000); // 30 days
  await updateDoc(userRef, {
    plan: planId,
    dailyLimit: limit,
    expiryDate: expiry
  });
};
