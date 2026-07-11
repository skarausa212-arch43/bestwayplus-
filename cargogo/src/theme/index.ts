export const colors = {
  brand: '#00A876',
  brandSoft: '#E8F6F0',
  ink: '#1E2430',
  sub: '#7A8394',
  faint: '#AEB6C4',
  line: '#EEF0F4',
  bg: '#EEF1F5',
  card: '#FFFFFF',
  danger: '#E2544A',
  dangerSoft: '#FDEEED',
  warn: '#F5A623',
  warnSoft: '#FEF5E4',
  info: '#4D8DFF',
  infoSoft: '#EBF2FF',
  vehicleS: '#FFC531',
  vehicleM: '#FF8A3D',
  vehicleL: '#4D8DFF',
};
export const spacing = { xs: 4, s: 8, m: 12, l: 16, xl: 24, xxl: 32 };
export const radius = { s: 8, m: 12, l: 16, xl: 24, full: 999 };
export const typography = {
  h1: { fontSize: 26, fontWeight: '800' as const, color: colors.ink },
  h2: { fontSize: 20, fontWeight: '700' as const, color: colors.ink },
  h3: { fontSize: 16, fontWeight: '700' as const, color: colors.ink },
  body: { fontSize: 15, color: colors.ink },
  sub: { fontSize: 13, color: colors.sub },
  caption: { fontSize: 11, color: colors.faint },
};
export const shadows = {
  card: {
    shadowColor: '#0F172A', shadowOpacity: 0.06, shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 }, elevation: 3,
  },
};
