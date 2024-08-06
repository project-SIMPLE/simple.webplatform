// src/components/navigation.tsx
import React from 'react';
import { Link } from 'react-router-dom';

const Navigation: React.FC = () => {
  return (
    <nav className="bg-blue-500 p-4 text-white">
      <ul className="flex space-x-4">
        <li>
          <Link to="/" className="hover:text-gray-200 text-white">
            Home
          </Link>
        </li>
        <li>
          <Link to="/monitor" className="hover:text-gray-200 text-white">
            Monitor
          </Link>
        </li>
        <li>
          <Link to="/monitorV2" className="hover:text-gray-200 text-white">
            Monitor V2
          </Link>
        </li>
        <li>
          <Link to="/settings" className="hover:text-gray-200 text-white">
            Settings
          </Link>
        </li>
        <li>
          <Link to="/player" className="hover:text-gray-200 text-white">
            Player
          </Link>
        </li>
      </ul>
    </nav>
  );
};

export default Navigation;
