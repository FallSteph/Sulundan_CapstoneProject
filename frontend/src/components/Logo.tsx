import React from 'react';
import { BookOpen } from 'lucide-react';

interface LogoProps {
  size?: 'sm' | 'md' | 'lg';
  showText?: boolean;
  className?: string;
}

export function Logo({ size = 'md', showText = true, className = '' }: LogoProps) {
  const sizeClasses = {
    sm: 'h-8 w-8',
    md: 'h-10 w-10',
    lg: 'h-14 w-14',
  };

  const textClasses = {
    sm: 'text-xl',
    md: 'text-2xl',
    lg: 'text-4xl',
  };

  return (
    <div className={`flex items-center gap-3 ${className}`}>
      <div className={`${sizeClasses[size]} flex-shrink-0 flex items-center justify-center rounded-xl overflow-hidden`}>
        <img 
          src="/sulundan logo.png" 
          alt="Sulundan Logo" 
          className="w-full h-full object-contain"
        />
      </div>
      {showText && (
        <span className={`${textClasses[size]} font-bold text-inherit tracking-tight whitespace-nowrap`}>
          Sulundan
        </span>
      )}
    </div>
  );
}
