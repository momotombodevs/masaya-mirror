import type { Config } from 'tailwindcss';

/** Resolves a theme token (space-separated RGB channels in index.css) to a color. */
const token = (name: string): string => `rgb(var(--${name}) / <alpha-value>)`;

export default {
  content: ['./index.html', './src/renderer/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: [
          '-apple-system',
          'BlinkMacSystemFont',
          '"Segoe UI Variable Text"',
          '"Segoe UI"',
          'system-ui',
          'sans-serif',
        ],
      },
      fontSize: {
        xs: ['11px', '14px'],
        sm: ['12px', '16px'],
        base: ['13px', '18px'],
        lg: ['15px', '20px'],
        xl: ['20px', '26px'],
      },
      borderRadius: {
        control: '6px',
        panel: '10px',
      },
      colors: {
        window: token('window'),
        content: token('content'),
        hover: token('hover'),
        line: token('line'),
        ink: { DEFAULT: token('ink'), 2: token('ink-2'), 3: token('ink-3') },
        accent: token('accent'),
        fill: token('fill'),
        success: token('success'),
        warning: token('warning'),
        danger: token('danger'),
        mirror: {
          canvas: '#000000',
          bar: '#1e1e1e',
          line: '#333333',
          text: '#f2f2f2',
          muted: '#98989d',
          hover: 'rgba(255, 255, 255, 0.1)',
        },
      },
      boxShadow: {
        control: '0 1px 1px rgba(0, 0, 0, 0.06)',
        sheet: '0 12px 40px rgba(0, 0, 0, 0.28)',
      },
    },
  },
} satisfies Config;
