import React from 'react';

interface HeaderProps {
    title: string;
}
// A continuer
const Header: React.FC<HeaderProps> = ({ title }) => {
    return (
        <header>
            <h1 className='bg-white'>{title}</h1>
        </header>
    );
};

export default Header;