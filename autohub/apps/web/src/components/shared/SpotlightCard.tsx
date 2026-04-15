import { useRef, useState, type MouseEvent, type ReactNode } from "react";

interface SpotlightCardProps {
  children: ReactNode;
  className?: string;
}

export const SpotlightCard = ({ children, className = "" }: SpotlightCardProps) => {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const [isHovered, setIsHovered] = useState(false);

  const handleMouseMove = (e: MouseEvent<HTMLDivElement>) => {
    if (!ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    setPos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
  };

  return (
    <div
      ref={ref}
      onMouseMove={handleMouseMove}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className={`spotlight-card ${className}`}
    >
      <div
        className="spotlight-overlay rounded-xl"
        style={{
          background: isHovered
            ? `radial-gradient(circle at ${pos.x}px ${pos.y}px, rgba(255,255,255,0.06), transparent 80%)`
            : "none",
          opacity: isHovered ? 1 : 0,
        }}
      />
      {children}
    </div>
  );
};
