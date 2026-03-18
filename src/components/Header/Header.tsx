import LanguageSelector from "../LanguageSelector/LanguageSelector";
import logoSimple from '/images/SIMPLE_Logo_Complet_Sticker.png';
import { Link } from 'react-router-dom';
const folder = process.env.IMAGE_SOURCE_FOLDER
const Header = () => {



    return (
        <div className="flex w-full justify-between align-middle relative" >
             <img src={`public/images/${folder}/Frames/header_simple.svg`} className="w-[600px] h-auto absolute left-[0px] top-[-100px]" alt="" /> 
            <Link to="/" className="text-white hover:text-gray-400 z-10">
                <img src={logoSimple} alt="Logo" className=" ml-10 w-[515px]  mt-12 pl-4" />
            </Link>
            <img src={`public/images/${folder}/Frames/header_language.svg`} className="w-[550px] h-auto absolute right-[-200px] top-[-70px]" alt="" />

            {/* ↓ this div is the white vertical separator on screen */}

            <LanguageSelector />



        </div>




    );
};
export default Header;
