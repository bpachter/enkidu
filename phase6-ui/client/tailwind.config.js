/**
 * Enkidu — Professional Blue design tokens
 * Deep navy base, electric cobalt primary, sky blue secondary.
 */
/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Surfaces
        bg:        '#0c0f18',
        surface:   '#111928',
        elevated:  '#1a2436',
        sunken:    '#080c17',
        border:    '#1e2a40',
        'border-strong': '#2d3d56',
        // Foreground
        fg:        '#c8d8f0',
        muted:     '#64748b',
        subtle:    '#334155',
        // Primary cobalt blue (replaces amber)
        amber:     { DEFAULT: '#4191f7', soft: '#4191f712', dim: '#1e3a6e', glow: '#4191f720' },
        // Sky blue (replaces cyan)
        cyan:      { DEFAULT: '#38bdf8', soft: '#38bdf810', dim: '#164e6a', glow: '#38bdf820' },
        // Success green
        emerald:   { DEFAULT: '#4ade80', soft: '#4ade8012', dim: '#166534' },
        // Error red
        rose:      { DEFAULT: '#f87171', soft: '#f871711a', dim: '#7f1d1d' },
        // Accent violet
        violet:    { DEFAULT: '#a78bfa', soft: '#a78bfa1a' },
      },
      fontFamily: {
        mono:    ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
        display: ['"Inter"', 'system-ui', 'sans-serif'],
        retro:   ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
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
        px: '1px',
        0.5: '2px',
      },
      boxShadow: {
        sm:         '0 1px 3px rgba(0,0,0,0.45)',
        DEFAULT:    '0 2px 8px rgba(0,0,0,0.5), 0 1px 2px rgba(0,0,0,0.4)',
        md:         '0 4px 16px rgba(0,0,0,0.55), 0 2px 4px rgba(0,0,0,0.4)',
        lg:         '0 8px 28px rgba(0,0,0,0.6), 0 4px 8px rgba(0,0,0,0.4)',
        panel:      '0 0 0 1px #1e2a40',
        'panel-hi': '0 0 0 1px #2d3d56, 0 4px 16px -4px rgba(65,145,247,0.18)',
      },
      borderRadius: {
        none: '0',
        sm:   '3px',
        DEFAULT: '5px',
        md:   '7px',
        lg:   '10px',
        full: '9999px',
      },
      animation: {
        'pulse-soft': 'pulse-soft 2.4s ease-in-out infinite',
        'pulse-fast': 'pulse-fast 0.7s ease-in-out infinite',
        'shimmer':    'shimmer 2.5s linear infinite',
      },
      keyframes: {
        'pulse-soft': { '0%,100%': { opacity: 1 }, '50%': { opacity: 0.45 } },
        'pulse-fast': { '0%,100%': { opacity: 1 }, '50%': { opacity: 0.35 } },
        'shimmer':    { '0%': { backgroundPosition: '-200% 0' }, '100%': { backgroundPosition: '200% 0' } },
      },
    },
  },
  plugins: [],
}
