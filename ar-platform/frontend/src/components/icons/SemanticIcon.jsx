import {
  Glasses,
  HeartPulse,
  Crown,
  UserRound,
  Image as ImageIcon,
  Smile,
  Package,
  Globe,
  Pin,
  Volume2,
  Sparkles,
  MessageSquare,
  Star,
  Link as LinkIcon,
  Vibrate,
  Heart,
  Flame,
  LogOut,
  CircleDot,
  Zap,
  Target,
  MapPin,
  PartyPopper,
  Skull,
  Check,
  Compass,
  Signal,
  BatteryFull,
  Flag,
  Drama,
  Eye,
  Pencil,
  Sunrise,
  Gift,
  TreePine,
  Landmark,
  Mountain,
  Shield,
  PawPrint,
  DoorOpen,
  Circle,
  Info,
  Play,
} from 'lucide-react';

/**
 * 语义图标注册表
 *
 * 背景：项目里 16 个文件、116 处把表情符号当"图标数据"用（例如 faceZones 用 👓 表示眼镜区）。
 * 需求是"界面全程禁止使用表情符号"。
 *
 * 做法：**不逐一改写数据文件**，而是把旧的表情符号当作 key，在这里映射到 Lucide 组件。
 * 所有渲染点改用 <SemanticIcon name={...} />，界面就不会再出现任何表情符号。
 *
 * 同时支持语义化英文 key（推荐新代码使用），便于后续逐步把数据文件里的 emoji 迁移掉。
 * 用法：
 *   <SemanticIcon name="🏛️" size={16} />          // 兼容旧数据
 *   <SemanticIcon name="landmark" size={16} />     // 推荐写法
 */
const REGISTRY = {
  // ---- 语义化 key（推荐）----
  glasses: Glasses,
  mask: HeartPulse,
  crown: Crown,
  beard: UserRound,
  picture: ImageIcon,
  smile: Smile,
  package: Package,
  globe: Globe,
  pin: Pin,
  sound: Volume2,
  sparkle: Sparkles,
  speech: MessageSquare,
  star: Star,
  link: LinkIcon,
  vibrate: Vibrate,
  heart: Heart,
  fire: Flame,
  finish: LogOut,
  dot: CircleDot,
  bolt: Zap,
  target: Target,
  location: MapPin,
  celebrate: PartyPopper,
  skull: Skull,
  check: Check,
  compass: Compass,
  signal: Signal,
  battery: BatteryFull,
  flag: Flag,
  mask2: Drama,
  drama: Drama,
  play: Play,
  eye: Eye,
  pencil: Pencil,
  sunrise: Sunrise,
  gift: Gift,
  bamboo: TreePine,
  landmark: Landmark,
  moai: Mountain,
  shield: Shield,
  fox: PawPrint,
  torii: Landmark,
  door: DoorOpen,
  circle: Circle,
  info: Info,

  // ---- 旧表情符号兼容映射（新代码不要用）----
  '👓': Glasses,
  '😷': HeartPulse,
  '👑': Crown,
  '🧔': UserRound,
  '🖼️': ImageIcon,
  '🖼': ImageIcon,
  '😊': Smile,
  '📦': Package,
  '🌍': Globe,
  '📌': Pin,
  '🔊': Volume2,
  '✨': Sparkles,
  '💬': MessageSquare,
  '⭐': Star,
  '🔗': LinkIcon,
  '📳': Vibrate,
  '❤️': Heart,
  '❤': Heart,
  '★': Star,
  '🔥': Flame,
  '🔚': LogOut,
  '🟢': CircleDot,
  '⚡': Zap,
  '🎯': Target,
  '📍': MapPin,
  '🎉': PartyPopper,
  '💀': Skull,
  '✓': Check,
  '✔': Check,
  '✓️': Check,
  '🧭': Compass,
  '📶': Signal,
  '🔋': BatteryFull,
  '🏁': Flag,
  '🎭': Drama,
  '👁️': Eye,
  '👁': Eye,
  '✏️': Pencil,
  '✏': Pencil,
  '🌅': Sunrise,
  '🎁': Gift,
  '🎋': TreePine,
  '🏛️': Landmark,
  '🏛': Landmark,
  '🗿': Mountain,
  '🚩': Flag,
  '🛡️': Shield,
  '🛡': Shield,
  '🦊': PawPrint,
  '⛩️': Landmark,
  '⛩': Landmark,
  '🚪': DoorOpen,
  '🔵': CircleDot,
  '⬜': Circle,
};

/** 该 name 是否已登记（用于排查漏配） */
export function hasSemanticIcon(name) {
  return Object.prototype.hasOwnProperty.call(REGISTRY, name);
}

export function getSemanticIcon(name) {
  return REGISTRY[name] || null;
}

/**
 * 渲染一个语义图标。
 * 找不到对应项时：不渲染任何东西（不把原始 emoji 漏到界面上），
 * 并在开发环境给出一次告警，避免静默丢图标。
 */
export default function SemanticIcon({ name, size = 16, strokeWidth = 1.75, className = '', ...rest }) {
  const Icon = REGISTRY[name];

  if (!Icon) {
    if (import.meta?.env?.DEV) {
      // eslint-disable-next-line no-console
      console.warn('[SemanticIcon] 未登记的图标名:', JSON.stringify(name));
    }
    return null;
  }

  return <Icon size={size} strokeWidth={strokeWidth} className={className} aria-hidden="true" {...rest} />;
}
