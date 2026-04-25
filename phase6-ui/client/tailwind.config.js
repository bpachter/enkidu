/**
 * Mithrandir theme tokens derive from CSS variables in src/index.css
 * so runtime dark/light switching updates Tailwind utility colors.
 */
/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Surfaces
        bg:        'rgb(var(--bg-rgb, 11 13 16) / <alpha-value>)',
        surface:   'var(--bg-panel)',
        elevated:  'var(--bg-elevated)',
        sunken:    'var(--bg-sunken)',
        border:    'var(--border)',
        'border-strong': 'var(--border-strong)',
        // Foreground
        fg:        'var(--fg)',
        'fg-strong': 'var(--fg-strong)',
        muted:     'var(--white-dim)',
        subtle:    'var(--subtle)',
        // Primary antique gold
        amber:     {
          DEFAULT: 'rgb(var(--amber-rgb) / <alpha-value>)',
          soft: 'var(--amber-soft)',
          dim: 'var(--amber-dim)',
          glow: 'var(--amber-glow)',
        },
        // Mithril silver
        cyan:      {
          DEFAULT: 'rgb(var(--cyan-rgb) / <alpha-value>)',
          soft: 'var(--cyan-soft)',
          dim: 'var(--cyan-dim)',
          glow: 'var(--cyan-glow)',
        },
        // Success green
        emerald:   {
          DEFAULT: 'var(--green)',
          soft: 'color-mix(in srgb, var(--green) 12%, transparent)',
          dim: 'var(--green-dim)',
        },
        // Error red
        rose:      {
          DEFAULT: 'var(--red)',
          soft: 'color-mix(in srgb, var(--red) 12%, transparent)',
          dim: 'var(--red-dim)',
        },
        // Accent violet
        violet:    { DEFAULT: 'var(--violet)', soft: 'color-mix(in srgb, var(--violet) 12%, transparent)' },
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
        panel:      '0 0 0 1px var(--border)',
        'panel-hi': '0 0 0 1px var(--border-strong), 0 4px 16px -4px var(--amber-glow)',
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
