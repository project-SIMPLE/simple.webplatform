// src/components/Button.tsx
import React from 'react';

interface ButtonProps {
  onClick: () => void;
  text?: string;
  bgColor: string;
  icon?: React.ReactNode;
  showText?: boolean;
  className?: string; 

}

const Button: React.FC<ButtonProps> = ({ onClick, text, bgColor, icon, showText = true, className }) => {
  return (
    <button
      onClick={onClick}
      className={`${bgColor} text-white py-2 px-4 rounded-lg flex items-center justify-center ${className}`}
    >
      {icon}
      {showText && text}
    </button>
  );
};

export default Button;
