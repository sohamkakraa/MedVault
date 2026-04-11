import { create } from 'zustand';
import * as SecureStore from 'expo-secure-store';

export interface User {
  email: string;
  name?: string;
  id: string;
}

interface AuthStore {
  isAuthenticated: boolean;
  token: string | null;
  user: User | null;
  loading: boolean;
  setAuthenticated: (token: string, user: User) => Promise<void>;
  logout: () => Promise<void>;
}

export const useAuthStore = create<AuthStore>((set) => ({
  isAuthenticated: false,
  token: null,
  user: null,
  loading: false,

  setAuthenticated: async (token: string, user: User) => {
    try {
      await SecureStore.setItemAsync('auth_token', token);
      await SecureStore.setItemAsync('user_data', JSON.stringify(user));
      set({ isAuthenticated: true, token, user });
    } catch (error) {
      console.error('Failed to store auth data:', error);
    }
  },

  logout: async () => {
    try {
      await SecureStore.deleteItemAsync('auth_token');
      await SecureStore.deleteItemAsync('user_data');
      set({ isAuthenticated: false, token: null, user: null });
    } catch (error) {
      console.error('Failed to clear auth data:', error);
    }
  },
}));
