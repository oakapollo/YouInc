// lib/auth.ts
import {
    createUserWithEmailAndPassword,
    signInWithEmailAndPassword,
    signOut,
    updateProfile,
    User,
  } from "firebase/auth";
  import { doc, serverTimestamp, setDoc } from "firebase/firestore";
  import { auth, db } from "./firebase";
  
  export async function registerWithEmail(params: {
    email: string;
    password: string;
    displayName?: string;
  }) {
    const { email, password, displayName } = params;
  
    const cred = await createUserWithEmailAndPassword(auth, email, password);
  
    // Optional displayName
    if (displayName && displayName.trim()) {
      await updateProfile(cred.user, { displayName: displayName.trim() });
    }
  
    // Create user profile doc (recommended)
    await setDoc(
      doc(db, "users", cred.user.uid),
      {
        email: cred.user.email,
        displayName: displayName?.trim() || cred.user.displayName || "",
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );
  
    return cred.user;
  }
  
  export async function loginWithEmail(params: { email: string; password: string }) {
    const { email, password } = params;
    const cred = await signInWithEmailAndPassword(auth, email, password);
    return cred.user;
  }
  
  export async function logout() {
    await signOut(auth);
  }
  
  export function getUserDisplayName(user: User | null) {
    if (!user) return "";
    return user.displayName || user.email || "User";
  }
  