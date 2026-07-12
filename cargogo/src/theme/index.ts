// Дизайн-система v4 (фирменный стиль PakujGo): светлая база,
// тиффани-акцент из логотипа (#00D8E0 → приглушён для контраста),
// тёмно-синий ink как в логотипе. Кнопки — тиффани.
export const colors = {
  brand: '#0FB5BE',        // тиффани — акцент и primary-кнопки
  brandDark: '#0A8F98',
  brandSoft: '#E2F8F9',
  ink: '#0E1826',          // тёмно-синий из логотипа
  sub: '#64748B',
  faint: '#94A3B8',
  line: '#E5E9EE',
  surface: '#EEF1F4',      // серые чипы и secondary-кнопки
  bg: '#F5F6F8',
  card: '#FFFFFF',
  danger: '#E5484D',
  dangerSoft: '#FDECEC',
  warn: '#F5A623',
  warnSoft: '#FFF4E0',
  info: '#3E7BFA',
  infoSoft: '#EAF1FF',
  vehicleS: '#FFC531',
  vehicleM: '#FF8A3D',
  vehicleL: '#3E7BFA',
};

// Градиенты: primary-кнопки — тиффани; тёмные элементы — navy из логотипа
export const gradients = {
  brand: ['#1BC8D2', '#0A9AA4'] as const,   // primary-кнопки (тиффани)
  danger: ['#F0565B', '#D93036'] as const,
  splash: ['#FFFFFF', '#E6F7F8'] as const,  // светлая заставка с лёгким тиффани
  ink: ['#1C2A3E', '#0E1826'] as const,     // navy (шапки, тёмные карточки)
};

export const spacing = { xs: 4, s: 8, m: 12, l: 16, xl: 24, xxl: 32 };
export const radius = { s: 10, m: 14, l: 18, xl: 24, full: 999 };
export const typography = {
  h1: { fontSize: 28, fontWeight: '800' as const, color: colors.ink, letterSpacing: -0.5 },
  h2: { fontSize: 20, fontWeight: '800' as const, color: colors.ink, letterSpacing: -0.3 },
  h3: { fontSize: 16, fontWeight: '700' as const, color: colors.ink },
  body: { fontSize: 15, color: colors.ink },
  sub: { fontSize: 13, color: colors.sub },
  caption: { fontSize: 11, color: colors.faint },
};
export const shadows = {
  card: {
    shadowColor: '#0E1826', shadowOpacity: 0.06, shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 }, elevation: 4,
  },
  soft: {
    shadowColor: '#0E1826', shadowOpacity: 0.05, shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 }, elevation: 2,
  },
};
