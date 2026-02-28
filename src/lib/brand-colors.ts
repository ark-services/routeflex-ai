/**
 * RouteFlex Brand Color System
 * Source of truth: routeflex-brand-system/tokens/tokens.json v1.0.0
 *
 * CSS custom properties are defined in globals.css.
 * This file provides TypeScript references and Tailwind class mappings.
 */

// ===== PRIMARY BRAND PALETTE =====

export const brandColors = {
  primary: {
    DEFAULT: '#1D6FFF', // Electric Blue — CTAs, active states, links
    light: '#4D8FFF',   // Blue on dark backgrounds
    tint: '#EBF2FF',    // Subtle blue backgrounds, hover states
    dark: '#0A4FCC',    // Primary button hover
  },
  ink: {
    900: '#0F1623', // Primary text, dark backgrounds
    700: '#2A3347', // Secondary dark surfaces, nav
    500: '#4A5568', // Body text, descriptions
    300: '#9BAABB', // Placeholder, muted labels
    100: '#E4E8F0', // Borders, dividers
  },
  surface: {
    page: '#F3F3F0',  // Page background
    card: '#FFFFFF',  // Card background
    input: '#F3F3F0', // Input background
  },
  border: 'rgba(15, 22, 35, 0.08)',
} as const;

// ===== STATUS COLUMN COLOR PALETTE =====

/**
 * Curated status label color palette
 * Monday.com-style palette with 25 unique colors
 * Ensures each label gets a distinct color until all are used
 */
export const STATUS_COLOR_PALETTE = [
  // Row 1: Blues & Purples
  { name: 'Indigo', value: '#4F46E5' },
  { name: 'Blue', value: '#2563EB' },
  { name: 'Sky', value: '#0284C7' },
  { name: 'Cyan', value: '#0891B2' },
  { name: 'Purple', value: '#7C3AED' },
  { name: 'Violet', value: '#8B5CF6' },

  // Row 2: Greens & Teals
  { name: 'Teal', value: '#0D9488' },
  { name: 'Emerald', value: '#059669' },
  { name: 'Green', value: '#16A34A' },
  { name: 'Lime', value: '#65A30D' },
  { name: 'Mint', value: '#10B981' },
  { name: 'Seafoam', value: '#14B8A6' },

  // Row 3: Yellows & Oranges
  { name: 'Yellow', value: '#EAB308' },
  { name: 'Amber', value: '#F59E0B' },
  { name: 'Orange', value: '#F97316' },
  { name: 'Coral', value: '#FB923C' },

  // Row 4: Reds & Pinks
  { name: 'Red', value: '#DC2626' },
  { name: 'Rose', value: '#E11D48' },
  { name: 'Pink', value: '#DB2777' },
  { name: 'Fuchsia', value: '#C026D3' },

  // Row 5: Neutrals
  { name: 'Slate', value: '#475569' },
  { name: 'Gray', value: '#6B7280' },
  { name: 'Stone', value: '#78716C' },
  { name: 'Zinc', value: '#71717A' },
  { name: 'Neutral', value: '#737373' },
] as const;

/**
 * Legacy export for backwards compatibility
 */
export const statusColorArray = STATUS_COLOR_PALETTE;

// ===== SEMANTIC COLORS =====

export const semanticColors = {
  success: '#16A34A',
  warning: '#D97706',
  error: '#EF4444',
  info: '#1D6FFF',
} as const;

// ===== BUTTON VARIANTS =====

export const buttonStyles = {
  primary: {
    bg: 'bg-rf-blue',
    hover: 'hover:bg-rf-blue-dark',
    text: 'text-white',
    shadow: 'shadow-rf-sm hover:shadow-rf-md',
  },
  secondary: {
    bg: 'bg-rf-blue',
    hover: 'hover:bg-rf-blue-dark',
    text: 'text-white',
    shadow: 'shadow-rf-sm',
  },
  danger: {
    bg: 'bg-rf-danger',
    hover: 'hover:bg-red-700',
    text: 'text-white',
  },
} as const;

// ===== SHADOW STYLES =====

export const shadows = {
  sm: 'shadow-rf-sm',
  md: 'shadow-rf-md',
  lg: 'shadow-rf-lg',
  xl: 'shadow-rf-xl',
  dropdown: 'shadow-rf-md',
  modal: 'shadow-rf-xl',
} as const;

// ===== ANIMATION PRESETS =====

export const animations = {
  fadeIn: 'animate-in fade-in duration-150',
  scaleIn: 'animate-in zoom-in-95 duration-150',
  slideDown: 'animate-in slide-in-from-top-2 duration-150',
} as const;
