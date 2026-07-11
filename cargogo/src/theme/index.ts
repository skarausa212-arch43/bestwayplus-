// Дизайн-система v2: глубже контраст, фирменный градиент, крупные радиусы
export const colors = {
  brand: '#00B37E',
  brandDark: '#008F63',
  brandSoft: '#E6F9F1',
  ink: '#0B1220',
  sub: '#5B6474',
  faint: '#9AA3B2',
  line: '#E8ECF2',
  bg: '#F2F5F9',
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

// Градиенты (expo-linear-gradient): кнопки, splash, шапки
export const gradients = {
  brand: ['#00C98D', '#00A876'] as const,
  danger: ['#F0565B', '#D93036'] as const,
  splash: ['#00C98D', '#007A5C'] as const,
  ink: ['#1B2434', '#0B1220'] as const,
};

export const spacing = { xs: 4, s: 8, m: 12, l: 16, xl: 24, xxl: 32 };
export const radius = { s: 10, m: 14, l: 18, xl: 26, full: 999 };
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
    shadowColor: '#0F172A', shadowOpacity: 0.08, shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 }, elevation: 4,
  },
  soft: {
    shadowColor: '#0F172A', shadowOpacity: 0.05, shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 }, elevation: 2,
  },
};
