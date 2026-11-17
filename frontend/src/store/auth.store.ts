import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { User } from '@/types';
import { usePosStore } from '@/store/pos.store';

interface AuthState {
  token: string | null;
  user: User | null;
  setAuth: (token: string, user: User) => void;
  logout: () => void;
  isAdmin: () => boolean;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      token: null,
      user: null,
      setAuth: (token, user) => {
        const currentUser = get().user;
        if (currentUser && currentUser.id !== user.id) usePosStore.getState().clearBill();
        localStorage.setItem('devi_token', token);
        set({ token, user });
      },
      logout: () => {
        usePosStore.getState().clearBill();
        localStorage.removeItem('devi_token');
        set({ token: null, user: null });
      },
      isAdmin: () => get().user?.role === 'ADMIN',
    }),
    { name: 'devi-auth', partialize: (s) => ({ token: s.token, user: s.user }) }
  )
);
