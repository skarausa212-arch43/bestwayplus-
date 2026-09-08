import type { Config } from 'tailwindcss';

/**
 * Brand tokens. These are the values from the Bestway Football style sheet;
 * nothing in the UI should introduce a colour outside this scale.
 */
const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: { DEFAULT: '#031A10', raised: '#061F15', panel: '#0A291C' },
        emerald: {
          light: '#8AF0B4',
          DEFAULT: '#38E887',
          strong: '#19C76B',
          deep: '#0C7B45',
        },
        ink: { DEFAULT: '#F5F7F6', muted: '#91A59A', faint: '#647A6D' },
        line: { DEFAULT: 'rgba(56,232,135,.16)', faint: 'rgba(56,232,135,.08)' },
        state: { warn: '#F0B429', bad: '#F2645A', info: '#5AB6F2' },
      },
      fontFamily: {
        display: ['var(--font-display)', 'system-ui', 'sans-serif'],
        sans: ['var(--font-sans)', 'system-ui', 'sans-serif'],
      },
      borderRadius: { xl: '14px', '2xl': '18px' },
      boxShadow: {
        glow: '0 8px 34px rgba(25,199,107,.28)',
        panel: '0 1px 0 rgba(56,232,135,.06)',
      },
      backgroundImage: {
        'emerald-gradient': 'linear-gradient(135deg,#8AF0B4,#19C76B)',
      },
    },
  },
  plugins: [],
};

export default config;
