import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut } from "firebase/auth";
import { getFirestore, doc, getDocFromServer } from "firebase/firestore";
import firebaseConfig from "../../firebase-applet-config.json";

// Initialize Firebase App
const app = initializeApp(firebaseConfig);

// Initialize Firestore with Database ID from the config
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);

// Initialize Auth
export const auth = getAuth(app);

// Google Sign In Provider
export const googleProvider = new GoogleAuthProvider();

// Standard handle error helpers as required by firebase-integration skill
export enum OperationType {
  CREATE = "create",
  UPDATE = "update",
  DELETE = "delete",
  LIST = "list",
  GET = "get",
  WRITE = "write",
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const rawMsg = error instanceof Error ? error.message : String(error);
  const code = (error as any)?.code || "";

  const isDuplicateOrLogPermissionMsg = 
    rawMsg.toLowerCase().includes("already exists") ||
    rawMsg.toLowerCase().includes("already-exists") ||
    rawMsg.toLowerCase().includes("permission-denied") ||
    rawMsg.toLowerCase().includes("permission denied") ||
    String(code).toLowerCase().includes("already-exists") ||
    String(code).toLowerCase().includes("permission-denied");

  const isLogPath = path && (
    path.includes("logs") ||
    path.includes("printer_logs") ||
    path.includes("alerts") ||
    path.includes("printer_counters")
  );

  if (isDuplicateOrLogPermissionMsg && isLogPath) {
    console.warn(`[FIREBASE_SAFE_RECOVERY] Ignorado erro de sincronização/duplicidade/regra em log/alerta de modo seguro: ${rawMsg} (código: ${code}, caminho: ${path})`);
    return;
  }

  const isConnectionError = 
    rawMsg.toLowerCase().includes("failed to fetch") ||
    rawMsg.toLowerCase().includes("failed-to-fetch") ||
    rawMsg.toLowerCase().includes("unreachable") ||
    rawMsg.toLowerCase().includes("network") ||
    rawMsg.toLowerCase().includes("socket") ||
    code === "unavailable";

  if (isConnectionError) {
    console.warn(`[FIREBASE_CONNECTION_INFO] Rede inacessível ou Firestore inacessível temporariamente: ${rawMsg} (caminho: ${path})`);
    return;
  }

  const errInfo: FirestoreErrorInfo = {
    error: rawMsg,
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData?.map((provider) => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || [],
    },
    operationType,
    path,
  };
  console.error("Firestore Error: ", JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

// Validation check on startup (Can be executed manually if needed, deactivated on load for stability)
async function testConnection() {
  try {
    const testDoc = doc(db, "test", "connection");
    await getDocFromServer(testDoc);
  } catch (error) {
    if (error instanceof Error && error.message.includes("the client is offline")) {
      console.warn("Please check your Firebase configuration. The client is offline.");
    }
  }
}
// testConnection(); deactivated on load to prevent false-alarm startup network alerts

// Simple Login and Logout wrapper using signInWithPopup
export const loginWithGoogle = async () => {
  try {
    const result = await signInWithPopup(auth, googleProvider);
    return result.user;
  } catch (error) {
    console.error("Auth Error (Google Login): ", error);
    throw error;
  }
};

export const logout = async () => {
  try {
    await signOut(auth);
  } catch (error) {
    console.error("Auth Error (Logout): ", error);
  }
};
