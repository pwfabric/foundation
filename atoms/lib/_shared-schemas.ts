/**
 * Shared primitive schemas used across block files.
 * Not exported from the public barrel — internal to blocks/ only.
 */

import { z } from 'zod'

/**
 * CSS unit value (number or string with unit)
 * Use for props that legitimately accept CSS strings: width, height, borderRadius, minHeight, maxWidth, minChildWidth
 */
export const cssUnitSchema = z.union([z.number(), z.string()])

/**
 * Pixel-only spacing value (number of pixels)
 * Use for gap, padding, spacing props — coerces "24" → 24
 */
export const cssPixelSchema = z.coerce.number()

/**
 * Direction schema
 */
export const directionSchema = z.enum(['row', 'column', 'row-reverse', 'column-reverse'])

/**
 * Alignment schema
 */
export const alignmentSchema = z.enum(['start', 'center', 'end', 'stretch', 'baseline'])

/**
 * Justify schema
 */
export const justifySchema = z.enum(['start', 'center', 'end', 'between', 'around', 'evenly'])

/**
 * Button variant schema
 */
export const buttonVariantSchema = z.enum([
  'primary',
  'secondary',
  'outline',
  'ghost',
  'destructive',
])
