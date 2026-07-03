const STORAGE_KEY = "invoiceProcessor:auth";

export interface User {
  name: string;
  email: string;
}

export function getUser(): User | null {
  if (typeof window === "undefined") return null;
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? (JSON.parse(stored) as User) : null;
  } catch {
    return null;
  }
}

export function login(user: User): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(user));
}

export function logout(): void {
  localStorage.removeItem(STORAGE_KEY);
}

export function isAuthenticated(): boolean {
  return getUser() !== null;
}
