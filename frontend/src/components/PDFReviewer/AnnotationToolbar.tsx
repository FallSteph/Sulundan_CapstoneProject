import React from 'react';
import {
  MousePointer2,
  MessageSquare,
  Highlighter,
  Pencil,
  Square,
  ArrowRight,
  Eraser,
  Undo2,
  Redo2,
  Trash2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  TooltipProvider,
} from '@/components/ui/tooltip';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Slider } from '@/components/ui/slider';
import { AnnotationTool, AnnotationStyle, ANNOTATION_COLORS, THICKNESS_OPTIONS } from './types';
import { cn } from '@/lib/utils';

interface AnnotationToolbarProps {
  activeTool: AnnotationTool;
  activeStyle: AnnotationStyle;
  onToolChange: (tool: AnnotationTool) => void;
  onStyleChange: (style: Partial<AnnotationStyle>) => void;
  onUndo: () => void;
  onRedo: () => void;
  onClear: () => void;
  canUndo: boolean;
  canRedo: boolean;
  className?: string;
}

const TOOLS: { id: AnnotationTool; icon: React.ElementType; label: string }[] = [
  { id: 'select', icon: MousePointer2, label: 'Select' },
  { id: 'comment', icon: MessageSquare, label: 'Comment' },
  { id: 'highlight', icon: Highlighter, label: 'Highlight' },
  { id: 'draw', icon: Pencil, label: 'Draw' },
  { id: 'rectangle', icon: Square, label: 'Rectangle' },
  { id: 'arrow', icon: ArrowRight, label: 'Arrow' },
  { id: 'eraser', icon: Eraser, label: 'Eraser' },
];

export function AnnotationToolbar({
  activeTool,
  activeStyle,
  onToolChange,
  onStyleChange,
  onUndo,
  onRedo,
  onClear,
  canUndo,
  canRedo,
  className,
}: AnnotationToolbarProps) {
  return (
    <TooltipProvider delayDuration={0}>
      <div className={cn(
        'flex items-center gap-1 p-2 bg-card border border-border rounded-xl shadow-soft',
        className
      )}>
        {/* Tool buttons */}
        {TOOLS.map((tool) => (
          <Tooltip key={tool.id}>
            <TooltipTrigger asChild>
              <Button
                variant={activeTool === tool.id ? 'default' : 'ghost'}
                size="icon"
                onClick={() => onToolChange(tool.id)}
                className="h-9 w-9"
                aria-label={tool.label}
              >
                <tool.icon className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="text-xs">
              {tool.label}
            </TooltipContent>
          </Tooltip>
        ))}

        <Separator orientation="vertical" className="h-6 mx-1" />

        {/* Color picker */}
        <Popover>
          <Tooltip>
            <TooltipTrigger asChild>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  size="icon"
                  className="h-9 w-9 relative"
                  aria-label="Color"
                >
                  <div
                    className="h-5 w-5 rounded-full border-2 border-background shadow-sm"
                    style={{ backgroundColor: activeStyle.color }}
                  />
                </Button>
              </PopoverTrigger>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="text-xs">
              Color
            </TooltipContent>
          </Tooltip>
          <PopoverContent className="w-auto p-3" align="center">
            <div className="space-y-3">
              <p className="text-sm font-medium">Color</p>
              <div className="grid grid-cols-4 gap-2">
                {ANNOTATION_COLORS.map((color) => (
                  <button
                    key={color}
                    className={cn(
                      'h-8 w-8 rounded-full border-2 transition-transform hover:scale-110',
                      activeStyle.color === color
                        ? 'border-primary ring-2 ring-primary/30'
                        : 'border-transparent'
                    )}
                    style={{ backgroundColor: color }}
                    onClick={() => onStyleChange({ color })}
                    aria-label={`Select color ${color}`}
                  />
                ))}
              </div>
            </div>
          </PopoverContent>
        </Popover>

        {/* Thickness picker */}
        <Popover>
          <Tooltip>
            <TooltipTrigger asChild>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  size="icon"
                  className="h-9 w-9"
                  aria-label="Thickness"
                >
                  <div
                    className="rounded-full bg-current"
                    style={{
                      width: `${Math.min(activeStyle.thickness * 3, 20)}px`,
                      height: `${Math.min(activeStyle.thickness * 3, 20)}px`,
                    }}
                  />
                </Button>
              </PopoverTrigger>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="text-xs">
              Thickness
            </TooltipContent>
          </Tooltip>
          <PopoverContent className="w-48 p-3" align="center">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium">Thickness</p>
                <span className="text-xs text-muted-foreground">{activeStyle.thickness}px</span>
              </div>
              <Slider
                value={[activeStyle.thickness]}
                onValueChange={([value]) => onStyleChange({ thickness: value })}
                min={1}
                max={8}
                step={1}
                className="w-full"
              />
              <div className="flex justify-between gap-1">
                {THICKNESS_OPTIONS.map((thickness) => (
                  <button
                    key={thickness}
                    className={cn(
                      'flex items-center justify-center h-8 w-8 rounded-lg border transition-colors',
                      activeStyle.thickness === thickness
                        ? 'border-primary bg-primary/10'
                        : 'border-border hover:bg-muted'
                    )}
                    onClick={() => onStyleChange({ thickness })}
                    aria-label={`${thickness}px thickness`}
                  >
                    <div
                      className="rounded-full bg-current"
                      style={{
                        width: `${Math.min(thickness * 2, 12)}px`,
                        height: `${Math.min(thickness * 2, 12)}px`,
                      }}
                    />
                  </button>
                ))}
              </div>
            </div>
          </PopoverContent>
        </Popover>

        <Separator orientation="vertical" className="h-6 mx-1" />

        {/* Undo/Redo */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              onClick={onUndo}
              disabled={!canUndo}
              className="h-9 w-9"
              aria-label="Undo"
            >
              <Undo2 className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="text-xs">
            Undo
          </TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              onClick={onRedo}
              disabled={!canRedo}
              className="h-9 w-9"
              aria-label="Redo"
            >
              <Redo2 className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="text-xs">
            Redo
          </TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              onClick={onClear}
              className="h-9 w-9 text-destructive hover:text-destructive"
              aria-label="Clear all annotations"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="text-xs">
            Clear All
          </TooltipContent>
        </Tooltip>
      </div>
    </TooltipProvider>
  );
}
