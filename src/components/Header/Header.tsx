import LanguageSelector from "../LanguageSelector/LanguageSelector";
import logoSimple from '/images/SIMPLE_Logo_Complet_Sticker.png';
import { Link } from 'react-router-dom';
const Header = ({ hideTranslation = false }) => {

    return (
        <div className="flex w-full justify-between px-6 align-middle" >


            <Link to="/" className="text-white hover:text-gray-400">
                <img src={logoSimple} alt="Logo" className="h-10 w-10 mr-4" style={{ height: '80px', width: 'auto' }} />
            </Link>

            {/* ↓ this div is the white vertical separator on screen */}
            {hideTranslation ?
                null
                :
                <LanguageSelector />
            }


        </div>




    );
};
export default Header;
