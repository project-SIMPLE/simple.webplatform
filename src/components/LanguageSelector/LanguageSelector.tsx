import { useState } from 'react';
import { useTranslation } from 'react-i18next';
const folder = process.env.IMAGE_SOURCE_FOLDER;
const LanguageSelector = () => {
  const { t, i18n } = useTranslation();
  const [showPopup, setShowPopup] = useState(false);

  const changeLanguage = (lng: string) => {
    i18n.changeLanguage(lng);
    setShowPopup(false); // close pop up after changing language



  };


  return (

    <div className='flex flex-col  h-full justify-center'>
      {/* Button to open the popup */}
        <img src={`public/images/${folder}/Language_selection/Language_selection_Button_00.png`} alt="language selection" className='size-14 cursor-pointer' onClick={()=>{setShowPopup(true)}}/>


      {/* Pop-up */}
      {showPopup && (
        <div className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-50 z-30" onClick={() => setShowPopup(false)}>

          <div className=" p-6 rounded-lg w-80" onClick={(e) => e.stopPropagation()}
            style={{ position: 'relative', top: '0', right: '0' }}
          >
            <button
              onClick={() => setShowPopup(false)}
              className=' rounded-full p-1 size-fit bg-none z-10'
              style={{ position: 'absolute', top: '0.5rem', right: '0.5rem' }}
            >
              <img src={`public/images/${folder}/Language_selection/Language_selection_close.png`} alt="" className='mix-blend-difference size-8' />
            </button>
            <h3 className="text-lg font-semibold mb-4">{t('select_language')}</h3>


            <img src={`public/images/${folder}/Language_selection/Language_selection_tab.png`} className="absolute size-full inset-0 objec-cover" alt="" />

            <div className="flex flex-col space-y-2 relative">

              <div className='relative flex items-center justify-center cursor-pointer transition-transform duration-300 hover:scale-105'>
                <img
                  src={`public/images/${folder}/Language_selection/Language_selection_Button_01.png`}
                  alt="English"
                  onClick={() => changeLanguage('en')}
                />
                <p className='absolute pointer-events-none'>English</p>
              </div>
              <div className='relative flex items-center justify-center cursor-pointer transition-transform duration-300 hover:scale-105'>
                <img
                  src={`public/images/${folder}/Language_selection/Language_selection_Button_02.png`}
                  alt="Français"
                  onClick={() => changeLanguage('fr')}
                />
                <p className='absolute pointer-events-none'>Français</p>
              </div>
              <div className='relative flex items-center justify-center cursor-pointer transition-transform duration-300 hover:scale-105'>
                <img
                  src={`public/images/${folder}/Language_selection/Language_selection_Button_01.png`}
                  alt="English"
                  onClick={() => changeLanguage('vn')}
                />
                <p className='absolute pointer-events-none'>Việt</p>
              </div>
              <div className='relative flex items-center justify-center cursor-pointer transition-transform duration-300 hover:scale-105'>
                <img
                  src={`public/images/${folder}/Language_selection/Language_selection_Button_01.png`}
                  alt="English"
                  onClick={() => changeLanguage('th')}
                />
                <p className='absolute pointer-events-none'>แบบไทย</p>
              </div>




            </div>


          </div>
        </div>
      )}
    </div>
  );
};

export default LanguageSelector;

