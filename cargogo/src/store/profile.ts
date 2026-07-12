import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Role } from '@/types';

/**
 * Аватары пользователей (своё фото в профиле) — по одному на роль.
 * Хранится URI выбранного изображения; переживает перезапуск.
 */
interface ProfileState {
  avatars: Partial<Record<Role, string>>;
  setAvatar: (role: Role, uri: string) => void;
  clearAvatar: (role: Role) => void;
}

export const useProfileStore = create<ProfileState>()(
  persist(
    (set) => ({
      avatars: {},
      setAvatar: (role, uri) => set((s) => ({ avatars: { ...s.avatars, [role]: uri } })),
      clearAvatar: (role) => set((s) => {
        const next = { ...s.avatars };
        delete next[role];
        return { avatars: next };
      }),
    }),
    { name: 'pakujgo-profile', storage: createJSONStorage(() => AsyncStorage) },
  ),
);
