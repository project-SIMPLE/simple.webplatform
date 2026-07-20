import type React from "react";

interface ButtonProps {
	onClick?: () => void;
	text?: string;
	bgColor: string;
	icon?: React.ReactNode;
	className?: string;
	customStyle?: React.CSSProperties;
}

const Button = ({ onClick, text, bgColor, icon, className, customStyle }: ButtonProps) => {
	return (
		<button
			type="button"
			onClick={onClick}
			className={`${bgColor} text-white py-1 px-1 rounded-lg flex flex-row items-center justify-center gap-1 ${className}`}
			style={customStyle}
		>
			{icon}

			<span className="text-black text-ls">{text}</span>
		</button>
	);
};

export default Button;
