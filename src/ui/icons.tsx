import {
  ArrowDownLeft, ArrowLeftRight, ArrowUpRight, Banknote, BookOpen, Briefcase, Building2, Car, ChartLine, ChartPie, CircleDollarSign,
  Clapperboard, Coffee, Dumbbell, Ellipsis, Fuel, Gamepad2, Gift, GraduationCap, HeartPulse, House, Landmark, Laptop, Layers, Leaf,
  Lightbulb, Music, PawPrint, Percent, PiggyBank, Pill, Plane, Repeat, Shield, Shirt, ShoppingBag, ShoppingCart, Smartphone, Sparkles,
  Star, Store, Tag, TrendingUp, Truck, Utensils, Wifi, Wrench, FileText, type LucideIcon,
} from 'lucide-react'

/** Curated icon set for categories, goals and asset types (keeps the bundle small). */
export const ICONS: Record<string, LucideIcon> = {
  tag: Tag, utensils: Utensils, coffee: Coffee, 'shopping-cart': ShoppingCart, car: Car, fuel: Fuel, plane: Plane, house: House,
  lightbulb: Lightbulb, wifi: Wifi, smartphone: Smartphone, clapperboard: Clapperboard, gamepad: Gamepad2, music: Music,
  'shopping-bag': ShoppingBag, shirt: Shirt, gift: Gift, 'heart-pulse': HeartPulse, pill: Pill, dumbbell: Dumbbell, paw: PawPrint,
  'graduation-cap': GraduationCap, book: BookOpen, repeat: Repeat, briefcase: Briefcase, store: Store, percent: Percent,
  banknote: Banknote, 'trending-up': TrendingUp, wrench: Wrench, sparkles: Sparkles, leaf: Leaf, ellipsis: Ellipsis,
  building: Building2, truck: Truck, shield: Shield, star: Star, laptop: Laptop, 'piggy-bank': PiggyBank,
  // transaction kinds
  'arrow-down-left': ArrowDownLeft, 'arrow-up-right': ArrowUpRight, transfer: ArrowLeftRight,
  // assets
  'chart-line': ChartLine, layers: Layers, 'chart-pie': ChartPie, 'file-text': FileText, 'circle-dollar': CircleDollarSign, landmark: Landmark,
}

export const CATEGORY_ICON_CHOICES = [
  'tag', 'utensils', 'coffee', 'shopping-cart', 'car', 'fuel', 'plane', 'house', 'lightbulb', 'wifi', 'smartphone', 'clapperboard', 'gamepad',
  'music', 'shopping-bag', 'shirt', 'gift', 'heart-pulse', 'pill', 'dumbbell', 'paw', 'graduation-cap', 'book', 'repeat', 'briefcase', 'store',
  'percent', 'banknote', 'trending-up', 'wrench', 'sparkles', 'leaf', 'ellipsis',
]
export const GOAL_ICON_CHOICES = ['house', 'building', 'truck', 'plane', 'car', 'graduation-cap', 'shield', 'heart-pulse', 'star', 'laptop', 'gift', 'piggy-bank']
export const COLOR_CHOICES = ['#00A8FF', '#38CFFF', '#35D6A0', '#7FD1B9', '#6C8CFF', '#B794F6', '#FF8FB1', '#FF6B78', '#FFB86B', '#F4D35E', '#8A9BB3']

export const ASSET_ICON: Record<string, string> = { stock: 'chart-line', etf: 'layers', fund: 'chart-pie', bond: 'file-text', cash: 'circle-dollar', other: 'sparkles' }
export const ACCOUNT_ICON: Record<string, string> = { bank: 'landmark', cash: 'banknote', savings: 'piggy-bank', investment: 'trending-up' }

export function Icon({ name, size = 18, color, strokeWidth = 2 }: { name: string; size?: number; color?: string; strokeWidth?: number }) {
  const C = ICONS[name] ?? Tag
  return <C size={size} color={color} strokeWidth={strokeWidth} aria-hidden />
}

/** Rounded tinted square with an icon, used for categories, accounts, goals. */
export function CatIcon({ icon, color = '#00A8FF', size = 36 }: { icon: string; color?: string; size?: number }) {
  return (
    <span className="cat-icon" style={{ width: size, height: size, background: `${color}24`, color }} aria-hidden>
      <Icon name={icon} size={Math.round(size * 0.46)} strokeWidth={2.2} />
    </span>
  )
}
