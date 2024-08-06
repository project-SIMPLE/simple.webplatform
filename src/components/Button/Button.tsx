// src/components/Button.tsx
import React from 'react';

interface ButtonProps {
  onClick: () => void;
  text?: string;
  bgColor: string;
  icon: React.ReactNode;
  showText?: boolean;
}

const Button: React.FC<ButtonProps> = ({ onClick, text, bgColor, icon, showText = true }) => {
  return (
    <button
      onClick={onClick}
      className={`${bgColor} text-white py-2 px-4 rounded-lg flex items-center justify-center`}
    >
      {icon}
      {showText && text}
    </button>
  );
};

export default Button;
