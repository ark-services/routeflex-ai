/**
 * RouteFlex AI Brand Color System
 *
 * Centralized color palette for consistent theming across the application.
 * Designed for enterprise SaaS with clean, professional aesthetics.
 */

// ===== PRIMARY BRAND PALETTE =====

export const brandColors = {
  // Primary Accent - Deep Indigo/Blue
  primary: {
    50: '#EEF2FF',
    100: '#E0E7FF',
    200: '#C7D2FE',
    300: '#A5B4FC',
    400: '#818CF8',
    500: '#6366F1', // Main primary
    600: '#4F46E5',
    700: '#4338CA',
    800: '#3730A3',
    900: '#312E81',
  },

  // Secondary Accent - Emerald Green
  secondary: {
    50: '#ECFDF5',
    100: '#D1FAE5',
    200: '#A7F3D0',
    300: '#6EE7B7',
    400: '#34D399',
    500: '#10B981', // Main secondary
    600: '#059669',
    700: '#047857',
    800: '#065F46',
    900: '#064E3B',
  },

  // Highlight Accent - Purple (Automate button tone)
  accent: {
    50: '#FAF5FF',
    100: '#F3E8FF',
    200: '#E9D5FF',
    300: '#D8B4FE',
    400: '#C084FC',
    500: '#A855F7', // Main accent
    600: '#9333EA',
    700: '#7E22CE',
    800: '#6B21A8',
    900: '#581C87',
  },

  // Neutrals
  neutral: {
    bg: '#F8FAFC',        // Soft slate white background
    card: '#FFFFFF',      // Card background
    border: '#E5E7EB',    // Border color
    mutedText: '#6B7280', // Muted text
    text: '#111827',      // Primary text
    hover: '#F3F4F6',     // Hover background
  },
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
  success: brandColors.secondary[600],
  warning: '#F59E0B', // Amber
  error: '#DC2626',   // Red
  info: brandColors.primary[500],
} as const;

// ===== BUTTON VARIANTS =====

export const buttonStyles = {
  primary: {
    gradient: 'bg-gradient-to-r from-purple-600 to-purple-700',
    hover: 'hover:from-purple-700 hover:to-purple-800',
    text: 'text-white',
    glow: 'hover:shadow-lg hover:shadow-purple-500/30',
  },
  secondary: {
    bg: 'bg-transparent',
    border: 'border-2 border-indigo-600',
    text: 'text-indigo-600',
    hover: 'hover:bg-indigo-50',
  },
  danger: {
    bg: 'bg-red-600',
    hover: 'hover:bg-red-700',
    text: 'text-white',
  },
} as const;

// ===== SHADOW STYLES =====

export const shadows = {
  sm: 'shadow-sm',
  md: 'shadow-md',
  lg: 'shadow-lg',
  xl: 'shadow-xl',
  dropdown: 'shadow-[0_4px_12px_rgba(0,0,0,0.1)]',
  modal: 'shadow-[0_20px_60px_rgba(0,0,0,0.15)]',
} as const;

// ===== ANIMATION PRESETS =====

export const animations = {
  fadeIn: 'animate-in fade-in duration-150',
  scaleIn: 'animate-in zoom-in-95 duration-150',
  slideDown: 'animate-in slide-in-from-top-2 duration-150',
} as const;
