import React from 'react';
import { Link } from 'react-router-dom';
import logoSimple from '/images/SIMPLE_Logo_Complet_Sticker.png'; // Replace with the correct path to your image

const MiniNavigation: React.FC = () => {
  return (
    <nav className=" bg-opacity-50 p-2 fixed left-0">
      <ul className="flex items-center space-x-4">
        <Link to="/" className="text-white hover:text-gray-400">
          <li>
            <img src={logoSimple} alt="Logo" className="h-10 w-10 mr-4" style={{ height: '50px', width: 'auto' }} /> 
          </li>
        </Link>
        <li>
          {/* <Link to="/" className="text-white hover:text-gray-400">
            Simulations
          </Link> */}
        </li>
      </ul>
    </nav>
  );
};

export default MiniNavigation;
