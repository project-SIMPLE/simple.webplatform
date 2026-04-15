import LanguageSelector from "../LanguageSelector/LanguageSelector";
import logoSimple from '/images/Logos/SIMPLE_Logo_Complet_Sticker.png';
import { Link } from 'react-router-dom';
 
const Header = () => {



    return (
        <div className="flex w-full justify-between align-middle relative" >

            <Link to="/" className="text-white hover:text-gray-400 z-10">
                <img src={logoSimple} alt="Logo" className=" ml-10 h-[6dvh]  mt-12 pl-4 hover:scale-110 transition-transform duration-200" />
            </Link>


            {/* ↓ this div is the white vertical separator on screen */}

            <LanguageSelector />



        </div>




    );
};
export default Header;
