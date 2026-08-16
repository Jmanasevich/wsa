import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        alb: { primary: '#46525A', orange: '#F26722', light: '#F4F5F6', mid: '#8B9AA3', text: '#2C3A42' },
        vino: { DEFAULT: '#722F37', deep: '#4E1F25' },
      },
      fontFamily: { sans: ['var(--font-montserrat)', 'Montserrat', 'sans-serif'] },
    },
  },
  plugins: [],
};
export default config;
