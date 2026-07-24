import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Role } from '@/types';
import { Locale } from '@/config/app';

// У каждой роли (пользователя) свой язык — как в HTML-прототипе.
// Уведомления рендерятся на языке роли-ПОЛУЧАТЕЛЯ.
interface LocaleState {
  langs: Record<Role, Locale>;
  setLang: (role: Role, lang: Locale) => void;
}

export const useLocaleStore = create<LocaleState>()(
  persist(
    (set) => ({
      langs: { customer: 'ru', driver: 'pl', admin: 'en' },
      setLang: (role, lang) => set((s) => ({ langs: { ...s.langs, [role]: lang } })),
    }),
    { name: 'cargogo-locale', storage: createJSONStorage(() => AsyncStorage) },
  ),
);
