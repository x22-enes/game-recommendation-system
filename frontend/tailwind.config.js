/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', '-apple-system', 'BlinkMacSystemFont', '"Segoe UI"', 'sans-serif'],
      },
      animation: {
        'fade-in': 'fadeIn 0.45s ease-out forwards',
        'fade-in-up': 'fadeInUp 0.5s ease-out forwards',
        'bar-fill': 'barFill 0.9s ease-out forwards',
        'shimmer': 'shimmer 2s ease-in-out infinite',
        'pulse-soft': 'pulseSoft 2.5s ease-in-out infinite',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        fadeInUp: {
          '0%': { opacity: '0', transform: 'translateY(12px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        barFill: {
          '0%': { width: '0%' },
          '100%': { width: 'var(--bar-width, 0%)' },
        },
        shimmer: {
          '0%, 100%': { opacity: '0.5' },
          '50%': { opacity: '1' },
        },
        pulseSoft: {
          '0%, 100%': { boxShadow: '0 0 0 0 rgba(34, 211, 238, 0)' },
          '50%': { boxShadow: '0 0 20px 2px rgba(34, 211, 238, 0.15)' },
        },
      },
      boxShadow: {
        'card': '0 4px 24px -4px rgba(0, 0, 0, 0.45)',
        'card-hover': '0 12px 40px -8px rgba(0, 0, 0, 0.55), 0 0 0 1px rgba(34, 211, 238, 0.12)',
        'glow-cyan': '0 0 24px rgba(34, 211, 238, 0.18)',
      },
    },
  },
  plugins: [],
}
