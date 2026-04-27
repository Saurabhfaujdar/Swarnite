const COLOR_MAP: Record<string, string> = {
  green:  'bg-green-100 text-green-800 border-green-300',
  blue:   'bg-blue-100 text-blue-800 border-blue-300',
  purple: 'bg-purple-100 text-purple-800 border-purple-300',
  amber:  'bg-amber-100 text-amber-800 border-amber-300',
  gray:   'bg-gray-200 text-gray-600 border-gray-300',
};

const ICON_MAP: Record<string, string> = {
  New: '🆕',
  Regular: '🔄',
  VIP: '⭐',
  Premium: '💎',
  Inactive: '💤',
};

interface Props {
  tag?: { label: string; color: string } | null;
  size?: 'sm' | 'md';
}

export default function CustomerCategoryBadge({ tag, size = 'sm' }: Props) {
  if (!tag) return null;
  const colors = COLOR_MAP[tag.color] || COLOR_MAP.gray;
  const icon = ICON_MAP[tag.label] || '';
  const textSize = size === 'sm' ? 'text-[10px]' : 'text-xs';

  return (
    <span className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded border font-semibold ${colors} ${textSize}`}>
      {icon} {tag.label}
    </span>
  );
}
