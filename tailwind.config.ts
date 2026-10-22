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
        control: '8px',
        panel: '12px',
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
        // Icon tiles (settings rows, device rows, empty states): always a white glyph on top.
        tone: {
          blue: '#0a84ff',
          indigo: '#4f7cff',
          green: '#30b050',
          orange: '#ff9f0a',
          red: '#ff453a',
          purple: '#8e5cf7',
          gray: '#8e8e93',
          teal: '#30b0c7',
        },
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
        sheet: '0 16px 48px rgba(0, 0, 0, 0.32)',
      },
    },
  },
} satisfies Config;
