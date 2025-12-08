'use client';

import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Check, GripVertical } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ThumbnailItemProps {
  id: number;
  orderIndex: number;
  originalIndex: number;
  thumbnail: string | null;
  isSelected: boolean;
  onClick: (e: React.MouseEvent) => void;
  onDoubleClick?: (e: React.MouseEvent) => void;
}

export function ThumbnailItem({
  id,
  orderIndex,
  originalIndex,
  thumbnail,
  isSelected,
  onClick,
  onDoubleClick,
}: ThumbnailItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      className={cn(
        'relative group cursor-pointer rounded-lg overflow-hidden transition-all duration-200',
        'border-2 bg-slate-800/50 hover:bg-slate-700/50',
        isDragging && 'opacity-50 scale-105 z-50',
        isSelected
          ? 'border-amber-400 ring-2 ring-amber-400/30 shadow-lg shadow-amber-500/10'
          : 'border-slate-600 hover:border-slate-500'
      )}
    >
      {/* Drag handle */}
      <div
        {...attributes}
        {...listeners}
        className={cn(
          'absolute top-2 left-2 z-10 p-1 rounded cursor-grab active:cursor-grabbing',
          'bg-slate-900/70 backdrop-blur-sm opacity-0 group-hover:opacity-100 transition-opacity',
          'hover:bg-slate-800'
        )}
      >
        <GripVertical className="h-4 w-4 text-slate-400" />
      </div>

      {/* Selection checkbox indicator */}
      {isSelected && (
        <div className="absolute top-2 right-2 z-10 w-5 h-5 rounded bg-amber-400 flex items-center justify-center">
          <Check className="h-3 w-3 text-slate-900" strokeWidth={3} />
        </div>
      )}

      {/* Thumbnail image */}
      <div className="aspect-[3/4] relative bg-slate-900 flex items-center justify-center">
        {thumbnail ? (
          <img
            src={thumbnail}
            alt={`Page ${originalIndex + 1}`}
            className="max-w-full max-h-full object-contain"
            draggable={false}
          />
        ) : (
          <div className="flex flex-col items-center justify-center text-slate-500">
            <div className="w-6 h-6 border-2 border-slate-600 border-t-amber-400 rounded-full animate-spin mb-2" />
            <span className="text-xs">Loading...</span>
          </div>
        )}
      </div>

      {/* Page info footer */}
      <div className="p-2 bg-slate-800/80 border-t border-slate-700/50">
        <div className="flex items-center justify-between">
          {/* Current position */}
          <span className="text-xs font-medium text-white">
            #{orderIndex + 1}
          </span>
        </div>

        {/* Original page number badge */}
        <div className="mt-1 flex items-center justify-between">
          <span className="text-xs px-1.5 py-0.5 rounded border border-slate-600 bg-slate-900/60 text-slate-300">
            (was {originalIndex + 1})
          </span>
        </div>
      </div>
    </div>
  );
}

