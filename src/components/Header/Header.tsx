import Navigation from "../Navigation/Navigation";
import MiniNavigation from "../Navigation/MiniNavigation";
import LanguageSelector from "../LanguageSelector/LanguageSelector";
import headerBackground from "/src/svg_logos/header_background.svg";
// A continuer


const Header = ({ needsMiniNav = false }) => {
    return ( 
    <div className="flex w-full">
             <img src={headerBackground} className="h-12"/>
        <header  className="flex w-full h-20 justify-around items-center" style={{ borderBottomLeftRadius: "40px", borderBottomRightRadius: "40px", backgroundColor: "#58FFCA"}}>
           
            {needsMiniNav ? <MiniNavigation /> : <Navigation/>}
<div className="w-1 h-4/5 border-l border-white"></div>

            <LanguageSelector />
            
        </header>
            <img src={headerBackground} alt="" className="-rotate-90 h-12"/>
        </div>




    );
};
export default Header;
