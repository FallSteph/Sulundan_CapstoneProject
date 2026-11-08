import React, { createContext, useContext, useState, useCallback, ReactNode, useEffect } from 'react';
import { User, UserRole } from '@/types';
import { useTheme } from '@/contexts/ThemeContext';
const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000';

const mapUserRole = (role: any): UserRole => {
  const roleMap: Record<string, UserRole> = {
    FACULTY: 'faculty',
    SENIOR_FACULTY: 'faculty',
    DEPT_HEAD: 'dept_head',
    DEAN: 'dean',
    CITL: 'citl',
    VPAA: 'vpaa',
    ADMIN: 'admin',
  };
  const rawRole = String(role || '').toUpperCase().replace(/[\s_]+/g, '_');
  return roleMap[rawRole] || (role as UserRole) || 'faculty';
};

const normalizeUser = (u: any): User => {
  if (!u) return u;
  if (u.role) u.role = mapUserRole(u.role);
  u.college = u.college ?? '';
  u.department = u.department ?? '';
  if (u._id && !u.id) u.id = String(u._id);
  u.employeeId = u.employeeId ?? u.employee_id ?? '';
  u.isSeniorFaculty = u.isSeniorFaculty ?? u.is_senior_faculty ?? false;
  return u as User;
};

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  initialized: boolean;
  login: (email: string, password: string, recaptchaToken: string) => Promise<{ success: boolean; error?: string; user?: User }>;
  signup: (data: SignupData) => Promise<{ success: boolean; error?: string }>;
  logout: () => void;
  updateUser: (updates: Partial<User>) => void;
  loginWithGoogle: (idToken: string) => Promise<{ success: boolean; error?: string }>;
}

interface SignupData {
  firstName: string;
  lastName: string;
  email: string;
  password?: string;
  role: UserRole;
  college: string;
  department: string;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const AUTH_USER_KEY = 'auth_user';
  const AUTH_TOKEN_KEY = 'auth_token';
  const [initialized, setInitialized] = useState(false);
  const { setTheme } = useTheme();

  useEffect(() => {
    try {
      const raw = localStorage.getItem(AUTH_USER_KEY);
      if (raw) {
        let parsed = JSON.parse(raw) as User;
        if (parsed && parsed.email) {
          parsed = normalizeUser(parsed);
          setUser(parsed);
          if (parsed.theme === 'dark' || parsed.theme === 'light') {
            setTheme(parsed.theme);
          }
        }
      }
    } catch {}
    setInitialized(true);
  }, []);
  useEffect(() => {
    (async () => {
      if (!user?.id) return;
      try {
        const res = await fetch(`${API_BASE}/users/${user.id}`);
        const data = await res.json();
        if (data?.success && data.user) {
          let u = data.user as User;
          u = normalizeUser(u);
          setUser(u);
          try {
            localStorage.setItem(AUTH_USER_KEY, JSON.stringify(u));
          } catch {}
          if (u?.theme === 'dark' || u?.theme === 'light') {
            setTheme(u.theme);
          }
        }
      } catch {}
    })();
  }, [initialized]);

  const login = useCallback(async (email: string, password: string, recaptchaToken: string) => {
    if (!recaptchaToken) {
      return { success: false, error: 'Please complete the reCAPTCHA challenge' };
    }

    try {
      const res = await fetch(`${import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000'}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, recaptchaToken }),
      });
      const data = await res.json();
      if (!data.success) {
        return { success: false, error: data.error || 'Login failed' };
      }
      let u = data.user as User;
      // Ensure hasPassword is boolean
      if (u) {
        u.hasPassword = !!data.user.hasPassword;
        u = normalizeUser(u);
      }
      setUser(u);
       try {
         localStorage.setItem(AUTH_USER_KEY, JSON.stringify(u));
         if (data.token) {
           localStorage.setItem(AUTH_TOKEN_KEY, String(data.token));
         }
         if (u?.theme === 'dark' || u?.theme === 'light') {
           setTheme(u.theme);
         }
       } catch {}
      return { success: true, user: u };
    } catch {
      return { success: false, error: 'Unable to contact auth server' };
    }
  }, []);

  const loginWithGoogle = useCallback(async (idToken: string) => {
    try {
      const res = await fetch(`${import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000'}/auth/google`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken }),
      });
      const data = await res.json();
      if (!data.success) {
        return { success: false, error: 'Google sign-in failed' };
      }
      let u = data.user as User;
      if (u) u = normalizeUser(u);
      setUser(u);
      try {
        localStorage.setItem(AUTH_USER_KEY, JSON.stringify(u));
        if (data.token) {
          localStorage.setItem(AUTH_TOKEN_KEY, String(data.token));
        }
        if (u?.theme === 'dark' || u?.theme === 'light') {
          setTheme(u.theme);
        }
      } catch {}
      return { success: true };
    } catch {
      return { success: false, error: 'Unable to contact auth server' };
    }
  }, []);

  const signup = useCallback(async (data: SignupData) => {
    try {
      const res = await fetch(`${import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000'}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          firstName: data.firstName,
          lastName: data.lastName,
          email: data.email,
          password: data.password,
          role: data.role,
          college: data.college,
          department: data.department,
        }),
      });
      const result = await res.json();
      if (!result.success) {
        return { success: false, error: result.error || 'Signup failed' };
      }
      return { success: true };
    } catch {
      return { success: false, error: 'Unable to contact auth server' };
    }
  }, []);

  const logout = useCallback(() => {
    setUser(null);
    try {
      localStorage.removeItem(AUTH_USER_KEY);
      localStorage.removeItem(AUTH_TOKEN_KEY);
      localStorage.removeItem('last_path');
    } catch {}
  }, []);

  const updateUser = useCallback((updates: Partial<User>) => {
    setUser(prev => {
      const next = prev ? { ...prev, ...updates } : (updates as User);
      try {
        localStorage.setItem(AUTH_USER_KEY, JSON.stringify(next));
      } catch {}
      return next;
    });
  }, []);

  return (
    <AuthContext.Provider value={{
      user,
      isAuthenticated: !!user,
      initialized,
      login,
      loginWithGoogle,
      signup,
      logout,
      updateUser,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
