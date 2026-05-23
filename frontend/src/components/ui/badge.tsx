import { cn } from '../../lib/utils';

const variants: Record<string, string> = {
  critical: 'bg-red-100 text-red-700 border-red-200',
  warning: 'bg-amber-100 text-amber-700 border-amber-200',
  info: 'bg-blue-100 text-blue-700 border-blue-200',
  success: 'bg-green-100 text-green-700 border-green-200',
  default: 'bg-gray-100 text-gray-600 border-gray-200',
};

export function Badge({ label, variant = 'default' }: { label: string; variant?: string }) {
  return (
    <span className={cn('inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border', variants[variant] ?? variants.default)}>
      {label}
    </span>
  );
}
