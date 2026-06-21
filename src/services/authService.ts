import AsyncStorage from '@react-native-async-storage/async-storage';

const BACKEND_URL = process.env.BACKEND_URL ?? 'http://localhost:3001';
const TOKEN_KEY = 'fellito_auth_token';
const USER_KEY = 'fellito_auth_user';
const DEVICE_ID_KEY = 'fellito_device_id';

// Generate or retrieve a stable device fingerprint for this installation
async function getDeviceId(): Promise<string> {
  let id = await AsyncStorage.getItem(DEVICE_ID_KEY);
  if (!id) {
    // crypto.randomUUID is available in React Native 0.73+ and modern browsers
    id = typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    await AsyncStorage.setItem(DEVICE_ID_KEY, id);
  }
  return id;
}

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: 'owner' | 'contributor';
  assignedGoLives: string[];
}

export async function login(email: string, password: string): Promise<{ token: string; user: AuthUser }> {
  const deviceId = await getDeviceId();
  const res = await fetch(`${BACKEND_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Device-ID': deviceId },
    body: JSON.stringify({ email, password }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? 'Login failed');
  await AsyncStorage.setItem(TOKEN_KEY, data.token);
  await AsyncStorage.setItem(USER_KEY, JSON.stringify(data.user));
  return data;
}

export async function logout(): Promise<void> {
  await AsyncStorage.multiRemove([TOKEN_KEY, USER_KEY]);
}

export async function getStoredToken(): Promise<string | null> {
  return AsyncStorage.getItem(TOKEN_KEY);
}

export async function getStoredUser(): Promise<AuthUser | null> {
  const raw = await AsyncStorage.getItem(USER_KEY);
  return raw ? JSON.parse(raw) : null;
}

export async function verifyStoredToken(): Promise<AuthUser | null> {
  const token = await getStoredToken();
  if (!token) return null;
  try {
    const res = await fetch(`${BACKEND_URL}/api/admin/me`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) { await logout(); return null; }
    const user = await res.json();
    await AsyncStorage.setItem(USER_KEY, JSON.stringify(user));
    return user;
  } catch {
    return null;
  }
}

// Attach token to every outgoing API request
export async function authHeaders(): Promise<Record<string, string>> {
  const token = await getStoredToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}
