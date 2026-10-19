import type { Config } from 'tailwindcss';

export default {
  content: ['./index.html', './src/renderer/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"SF Pro Text"', '"Segoe UI"', '-apple-system', 'BlinkMacSystemFont', '"Helvetica Neue"', 'sans-serif'],
      },
      fontSize: {
        xs: '0.69rem',
        sm: '0.8rem',
        md: '0.9rem',
        lg: '1.02rem',
      },
      fontWeight: {
        medium: '560',
        semibold: '680',
      },
      maxWidth: {
        layout: '1120px',
      },
      borderRadius: {
        xs: '6px',
        sm: '8px',
        md: '12px',
        lg: '16px',
        xl: '20px',
        control: '10px',
      },
      colors: {
        canvas: '#f5f5f2',
        surface: { 1: '#fffefa', 2: '#faf9f5', 3: '#f2f1ec' },
        line: { DEFAULT: '#d8d1c5', subtle: '#e8e3da', strong: '#b9afa0' },
        ink: { DEFAULT: '#181715', secondary: '#5e5a52', tertiary: '#817b70' },
        brand: '#6d5efc',
        action: { DEFAULT: '#1f1d1a', hover: '#11100e', soft: '#f0eee8' },
        hover: { DEFAULT: '#f1efe9', strong: '#e9e4dc' },
        selected: '#f6f3ff',
        success: { bg: '#eef7f1', border: '#c5decc', text: '#286143' },
        warning: { bg: '#fbf3e3', border: '#ead2a5', text: '#77541b' },
        danger: { bg: '#fbefef', border: '#e6c1c1', text: '#8e2d35' },
        mirror: {
          canvas: '#090908',
          1: '#0f0f0d',
          2: '#171612',
          3: '#222017',
          border: 'rgba(226, 219, 205, 0.14)',
          hover: 'rgba(226, 219, 205, 0.1)',
          text: '#f5f2ea',
          muted: '#aaa397',
          'danger-bg': '#2d1a1c',
          'danger-border': 'rgba(142, 45, 53, 0.44)',
          'danger-text': '#ffe5ea',
        },
      },
      boxShadow: {
        surface: '0 1px 2px rgba(24, 23, 21, 0.04), 0 12px 30px rgba(24, 23, 21, 0.045)',
        popover: '0 18px 46px rgba(0, 0, 0, 0.3)',
        dialog: '0 24px 70px rgba(12, 10, 8, 0.24)',
        focus: '0 0 0 3px rgba(31, 29, 26, 0.15)',
      },
    },
  },
} satisfies Config;
