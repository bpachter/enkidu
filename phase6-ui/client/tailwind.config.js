/**
 * Enkidu — design tokens
 * Operator-console aesthetic: amber/cyan accents on deep slate, with
 * proper type scale, spacing rhythm, and a11y-grade focus rings.
 */
/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Surface
        bg:        '#05060b',
        surface:   '#0a0c14',
        elevated:  '#101421',
        sunken:    '#070811',
        border:    '#1a2138',
        'border-strong': '#2a3454',
        // Foreground
        fg:        '#e6ebf5',
        muted:     '#7a8499',
        subtle:    '#4a5468',
        // Accents
        amber:     { DEFAULT: '#ffb13b', soft: '#ffb13b22', dim: '#a36c14', glow: '#ffb13b40' },
        cyan:      { DEFAULT: '#22d3ee', soft: '#22d3ee1a', dim: '#0d6573', glow: '#22d3ee35' },
        emerald:   { DEFAULT: '#3ddc84', soft: '#3ddc841a', dim: '#1e7a45' },
        rose:      { DEFAULT: '#ff4d6d', soft: '#ff4d6d1a', dim: '#7a1f30' },
        violet:    { DEFAULT: '#a78bfa', soft: '#a78bfa1a' },
      },
      fontFamily: {
        mono:    ['"JetBrains Mono"', '"Fira Code"', '"Share Tech Mono"', 'ui-monospace', 'monospace'],
        display: ['"Space Grotesk"', '"Inter"', 'system-ui', 'sans-serif'],
        retro:   ['"VT323"', '"Share Tech Mono"', 'monospace'],
      },
      fontSize: {
        '2xs': ['10px', { lineHeight: '1.4', letterSpacing: '0.06em' }],
        xs:    ['11px', { lineHeight: '1.45' }],
        sm:    ['12.5px', { lineHeight: '1.5' }],
        base:  ['13.5px', { lineHeight: '1.55' }],
        md:    ['14.5px', { lineHeight: '1.55' }],
        lg:    ['16px',   { lineHeight: '1.45' }],
        xl:    ['18px',   { lineHeight: '1.35' }],
        '2xl': ['22px',   { lineHeight: '1.25' }],
        '3xl': ['28px',   { lineHeight: '1.2'  }],
      },
      spacing: {
        // 4px rhythm: 1=4, 2=8, 3=12, 4=16, 5=20, 6=24, 8=32
        px: '1px',
        0.5: '2px',
      },
      boxShadow: {
        glow:        '0 0 12px var(--tw-shadow-color)',
        'glow-sm':   '0 0 6px var(--tw-shadow-color)',
        'glow-lg':   '0 0 24px var(--tw-shadow-color)',
        panel:       '0 0 0 1px #1a2138, 0 1px 0 0 rgba(255,255,255,0.02) inset',
        'panel-hi':  '0 0 0 1px #2a3454, 0 0 24px -8px rgba(34,211,238,0.18)',
      },
      borderRadius: {
        none: '0',
        sm:   '2px',
        DEFAULT: '3px',
        md:   '4px',
        lg:   '6px',
      },
      animation: {
        'pulse-soft': 'pulse-soft 2.4s ease-in-out infinite',
        'pulse-fast': 'pulse-fast 0.7s ease-in-out infinite',
        'scan':       'scan 6s linear infinite',
        'shimmer':    'shimmer 2.5s linear infinite',
      },
      keyframes: {
        'pulse-soft': { '0%,100%': { opacity: 1 }, '50%': { opacity: 0.45 } },
        'pulse-fast': { '0%,100%': { opacity: 1 }, '50%': { opacity: 0.3 } },
        'scan':       { '0%': { transform: 'translateY(-100%)' }, '100%': { transform: 'translateY(100%)' } },
        'shimmer':    { '0%': { backgroundPosition: '-200% 0' }, '100%': { backgroundPosition: '200% 0' } },
      },
    },
  },
  plugins: [],
}
