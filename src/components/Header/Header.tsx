import { Link } from "react-router-dom";
import LanguageSelector from "../LanguageSelector/LanguageSelector";

// public/ assets are served as-is by Vite — reference by URL string, don't
// import as a module (importing broke Vitest's transform on Windows: it
// tried to resolve the root-absolute path as a filesystem path and failed
// with "must be a file URL object... Received 'file:///images/...'").
const logoSimple = "/images/Logos/SIMPLE_Logo_Complet_Sticker.png";

interface HeaderProps {
	onLogoClick?: () => void;
}

const Header = ({ onLogoClick }: HeaderProps) => {
	return (
		<div className="flex w-full justify-between align-middle relative">
			{onLogoClick ? (
				<button
					type="button"
					onClick={onLogoClick}
					className="text-white hover:text-gray-400 z-10 bg-transparent border-none p-0"
				>
					<img
						src={logoSimple}
						alt="Logo"
						className="ml-10 h-[6dvh] mt-12 pl-4 hover:scale-110 transition-transform duration-200"
					/>
				</button>
			) : (
				<Link to="/" className="text-white hover:text-gray-400 z-10">
					<img
						src={logoSimple}
						alt="Logo"
						className="ml-10 h-[6dvh] mt-12 pl-4 hover:scale-110 transition-transform duration-200"
					/>
				</Link>
			)}

			{/* ↓ this div is the white vertical separator on screen */}

			<LanguageSelector />
		</div>
	);
};
export default Header;
