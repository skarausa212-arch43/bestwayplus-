import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppNotification, Role } from '@/types';

interface NotifState {
  items: AppNotification[];
  toast: AppNotification | null;
  activeRole: Role | null;
  setActiveRole: (r: Role | null) => void;
  add: (n: Omit<AppNotification, 'id' | 'read' | 'createdAt'>) => void;
  markAllRead: (role: Role) => void;
  dismissToast: () => void;
  unreadCount: (role: Role) => number;
}

export const useNotificationStore = create<NotifState>()(
  persist(
    (set, get) => ({
      items: [],
      toast: null,
      activeRole: null,
      setActiveRole: (r) => set({ activeRole: r }),
      add: (n) => {
        const item: AppNotification = {
          ...n, id: `n-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          read: false, createdAt: new Date().toISOString(),
        };
        set((s) => ({
          items: [item, ...s.items],
          // toast только для активной роли на этом устройстве
          toast: s.activeRole === n.role ? item : s.toast,
        }));
        setTimeout(() => {
          if (get().toast?.id === item.id) set({ toast: null });
        }, 3500);
      },
      markAllRead: (role) => set((s) => ({
        items: s.items.map((i) => (i.role === role ? { ...i, read: true } : i)),
      })),
      dismissToast: () => set({ toast: null }),
      unreadCount: (role) => get().items.filter((i) => i.role === role && !i.read).length,
    }),
    {
      name: 'cargogo-notifications',
      storage: createJSONStorage(() => AsyncStorage),
      // toast и activeRole — эфемерные, не переживают перезапуск
      partialize: (s) => ({ items: s.items }),
      merge: (persisted, current) => ({ ...current, ...(persisted as Partial<NotifState>) }),
    },
  ),
);
