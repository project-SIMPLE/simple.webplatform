// src/components/Button.tsx
import React from 'react';

interface ButtonProps {
  onClick: () => void;
  text: string;
  bgColor: string;
  icon: React.ReactNode;
}

const Button: React.FC<ButtonProps> = ({ onClick, text, bgColor, icon }) => {
  return (
    <button
      onClick={onClick}
      className={`${bgColor} text-white py-2 px-4 rounded-lg flex items-center justify-center`}
    >
      {icon}
      {text}
    </button>
  );
};

export default Button;
