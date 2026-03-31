import LanguageSelector from "../LanguageSelector/LanguageSelector";
import logoSimple from '/images/SIMPLE_Logo_Complet_Sticker.png';
import { Link } from 'react-router-dom';
const folder = process.env.IMAGE_SOURCE_FOLDER
const Header = () => {



    return (
        <div className="flex w-full justify-between align-middle relative" >
            {folder === "V2" &&
             <img src={`/images/${folder}/Frames/header_simple.svg`} className="h-[10dvw] w-auto absolute left-[0px] top-[-100px]" alt="" /> 
            }
            <Link to="/" className="text-white hover:text-gray-400 z-10">
                <img src={logoSimple} alt="Logo" className=" ml-10 h-[6dvh]  mt-12 pl-4 hover:scale-110 transition-transform duration-200" />
            </Link>
            {folder === "V2" &&
            <img src={`/images/${folder}/Frames/header_language.svg`} className="h-[10dvh] w-auto absolute right-[-200px] top-[-70px]" alt="" />
            }

            {/* ↓ this div is the white vertical separator on screen */}

            <LanguageSelector />



        </div>




    );
};
export default Header;
