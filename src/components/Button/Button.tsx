// src/components/Button.tsx
import React from 'react';

interface ButtonProps {
  onClick?: () => void;
  text?: string;
  bgColor: string;
  icon?: React.ReactNode;
  showText?: boolean;
  className?: string; 

}

const Button: React.FC<ButtonProps> = ({ onClick, text, bgColor, icon, showText = true, className }) => {
  return (
    <div className="flex">
  <button
    onClick={onClick}
    className={`${bgColor} text-white py-1 px-1.5 rounded-lg flex flex-col items-center justify-center gap-1 ${className}`} // Utilisez flex-col pour une disposition verticale
  >
    {icon}
    <span className="text-black text-xs">{text}</span> 
  </button>
</div>

  );
};

export default Button;
