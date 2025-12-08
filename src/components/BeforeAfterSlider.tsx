import { useState, useRef, useEffect, useCallback } from 'react';

interface BeforeAfterSliderProps {
  beforeImage: string;
  afterImage: string;
  beforeLabel?: string;
  afterLabel?: string;
  className?: string;
  alt?: string;
}

export default function BeforeAfterSlider({
  beforeImage,
  afterImage,
  beforeLabel = 'Before',
  afterLabel = 'After',
  className = '',
  alt = 'Before and after comparison',
}: BeforeAfterSliderProps) {
  const [sliderPosition, setSliderPosition] = useState(50);
  const [isDragging, setIsDragging] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const handleMouseDown = () => {
    setIsDragging(true);
  };

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!containerRef.current) return;

    const rect = containerRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const percentage = Math.max(0, Math.min(100, (x / rect.width) * 100));
    setSliderPosition(percentage);
  }, []);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  const handleTouchMove = useCallback((e: TouchEvent) => {
    if (!containerRef.current) return;

    const rect = containerRef.current.getBoundingClientRect();
    const touch = e.touches[0];
    const x = touch.clientX - rect.left;
    const percentage = Math.max(0, Math.min(100, (x / rect.width) * 100));
    setSliderPosition(percentage);
  }, []);

  useEffect(() => {
    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      document.addEventListener('touchmove', handleTouchMove);
      document.addEventListener('touchend', handleMouseUp);
      document.body.style.cursor = 'ew-resize';
      document.body.style.userSelect = 'none';
    } else {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.removeEventListener('touchmove', handleTouchMove);
      document.removeEventListener('touchend', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.removeEventListener('touchmove', handleTouchMove);
      document.removeEventListener('touchend', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [isDragging, handleMouseMove, handleMouseUp, handleTouchMove]);

  return (
    <div
      ref={containerRef}
      className={`relative w-full bg-white border border-[#f0f0f0] shadow-[0px_0px_12px_0px_rgba(0,0,0,0.04)] flex flex-col gap-4 pb-9 pt-6 px-6 ${className}`}
    >
      {/* Labels at the top */}
      <div className="flex items-center justify-between relative shrink-0 w-full">
        <div className="bg-white border border-[#e2e2e2] flex items-center justify-center py-1 px-1 rounded-lg shrink-0 w-20">
          <p className="font-normal leading-[14px] text-sm text-[#111314]">
            {beforeLabel}
          </p>
        </div>
        <div className="bg-white border border-[#e2e2e2] flex items-center justify-center py-1 px-1 rounded-lg shrink-0 w-20">
          <p className="font-normal leading-[14px] text-sm text-[#111314]">
            {afterLabel}
          </p>
        </div>
      </div>

      {/* Image container */}
      <div className="relative w-full flex-1 min-h-0">
        {/* Hidden image to set container height */}
        <img
          src={beforeImage}
          alt=""
          className="w-full h-auto opacity-0 pointer-events-none"
          aria-hidden="true"
        />
        
        {/* Slider container with absolute positioning */}
        <div className="absolute inset-0 overflow-hidden">
          {/* Before Image (Background - always visible) */}
          <div className="absolute inset-0 flex items-center justify-center">
            <img
              src={beforeImage}
              alt={`${alt} - ${beforeLabel}`}
              className="h-full w-auto object-contain"
            />
          </div>

          {/* After Image Wrapper - clips from left to reveal before image */}
          <div
            className="absolute inset-0 overflow-hidden"
            style={{ clipPath: `inset(0 ${100 - sliderPosition}% 0 0)` }}
          >
            <div className="absolute inset-0 flex items-center justify-center">
              <img
                src={afterImage}
                alt={`${alt} - ${afterLabel}`}
                className="h-full w-auto object-contain"
              />
            </div>
          </div>

          {/* Slider Handle - vertical line */}
          <div
            className="absolute top-0 bottom-0 cursor-ew-resize z-10"
            style={{ 
              left: `${sliderPosition}%`, 
              borderLeft: '2px solid #6D99CECC',
              transform: 'translateX(-0%)',
              width: '54px',
              background: 'linear-gradient(270deg, rgba(255, 255, 255, 0) 0%, rgba(153, 200, 255, 0.4) 100%)'
            }}
            onMouseDown={handleMouseDown}
            onTouchStart={handleMouseDown}
          />
        </div>
      </div>
    </div>
  );
}

