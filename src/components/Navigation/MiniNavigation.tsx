import { Link } from 'react-router-dom';
import logoSimple from '/images/SIMPLE_Logo_Complet_Sticker.png'; // Replace with the correct path to your image

const MiniNavigation = () => {
  return (
    <Link to="/" className="text-white hover:text-gray-400">
      <img src={logoSimple} alt="Logo" className="h-10 w-10 mr-4" style={{ height: '50px', width: 'auto' }} />
    </Link>
  );
};

export default MiniNavigation;
