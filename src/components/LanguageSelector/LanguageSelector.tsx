import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import letterswitch from '/src/svg_logos/letter_switch.svg';
import x_cross from '/src/svg_logos/x_cross.svg';
const LanguageSelector = () => {
  const { t, i18n } = useTranslation();
  const [showPopup, setShowPopup] = useState(false);
  const button_green = "px-4 py-2 bg-green-500 text-white rounded-md hover:bg-green-600 transition duration-300"; //factorisation of button attributes for better readability and ease of modification

  const changeLanguage = (lng: string) => {
    i18n.changeLanguage(lng);
    setShowPopup(false); // close pop up after changing language



  };


  return (

    <div>
      {/* Button pour open the popup */}
      <button
        onClick={() => setShowPopup(true)}
        className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition duration-300 flex items-center"
      >
        {t('change_language')}
        <img src={letterswitch} alt="switch language" className='ml-2' />
      </button>


      {/* Pop-up */}
      {showPopup && (
        <div className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-50 z-10" onClick={() => setShowPopup(false)}>

          <div className="bg-white p-6 rounded-lg shadow-lg w-80" onClick={(e) => e.stopPropagation()}
            style={{ position: 'relative', top: '0', right: '0' }}
            >
            <button
              onClick={() => setShowPopup(false)}
              className='bg-white hover:bg-gray-200 rounded-full p-1 size-fit'
              style={{ position: 'absolute', top: '0.5rem', right: '0.5rem' }}
            >
              <img src={x_cross} alt="" className='mix-blend-difference size-8' />
            </button>
            <h3 className="text-lg font-semibold mb-4">{t('select_language')}</h3>



            <div className="flex flex-col space-y-2">
              <button
                onClick={() => changeLanguage('en')}
                className={button_green}
              >
                English
              </button>
              <button
                onClick={() => changeLanguage('fr')}
                className={button_green}
              >
                Français
              </button>
              <button
                onClick={() => changeLanguage('vn')}
                className={button_green}
              >
                Việt
              </button>
              <button
                onClick={() => changeLanguage('th')}
                className={button_green}
              >
                แบบไทย
              </button>
            </div>


          </div>
        </div>
      )}
    </div>
  );
};

export default LanguageSelector;

