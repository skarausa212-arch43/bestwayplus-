import { create } from 'zustand';
import { User } from '@/types';
import { MOCK_USERS } from '@/mocks';
import { useNotificationStore } from './notifications';

interface AuthState {
  user: User | null;
  login: (email: string, password: string) => { ok: boolean; error?: string };
  registerCustomer: (data: { firstName: string; lastName: string; phone: string; email: string; password: string }) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  login: (email, password) => {
    const found = MOCK_USERS.find((u) => u.email.toLowerCase() === email.toLowerCase().trim());
    if (!found || found.password !== password) return { ok: false, error: 'Nieprawidłowy e-mail lub hasło' };
    const { password: _, ...user } = found;
    set({ user });
    useNotificationStore.getState().setActiveRole(user.role);
    return { ok: true };
  },
  registerCustomer: (data) => {
    const user: User = {
      id: `u-${Date.now()}`, role: 'customer', ...data,
      status: 'active', createdAt: new Date().toISOString(),
    };
    set({ user });
    useNotificationStore.getState().setActiveRole('customer');
  },
  logout: () => {
    useNotificationStore.getState().setActiveRole(null);
    set({ user: null });
  },
}));
