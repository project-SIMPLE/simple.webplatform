import { useState } from 'react';
import { useTranslation } from 'react-i18next';

const LanguageSelector = () => {
  const { t, i18n } = useTranslation();
  const [showPopup, setShowPopup] = useState(false);

  const changeLanguage = (lng: string) => {
    i18n.changeLanguage(lng);
    setShowPopup(false); // close pop up after changing language


  };

  const buttonStyle = 'relative flex flex-row items-center justify-center cursor-pointer  transition-transform duration-300 hover:scale-105'

  return (

    <div className='flex flex-col  h-full justify-center z-10 mr-[95px] mt-[23px]'>
      {/* Button to open the popup */}
      <img src={` /images/V1/Language_selection/Language_selection_Button_00.png`} alt="language selection" className='size-[6dvh] cursor-pointer hover:scale-110 transition-transform duration-200' onClick={() => { setShowPopup(true) }} />


      {/* Pop-up */}
      {showPopup && (
        <div className="fixed inset-0 flex items-center justify-center bg-black/50 " onClick={() => setShowPopup(false)}>

          <div className=" p-6 rounded-lg w-80 relative top-0 right-0" onClick={(e) => e.stopPropagation()}>

            <img src={` images/V1/Language_selection/Language_selection_close.png`} alt="" className='size-[5dvh] absolute top-[8%] right-[11.5%] mr-1 cursor-pointer z-10 hover:scale-110 transition-transform duration-200'
              onClick={() => setShowPopup(false)} />

            <h3 className="text-lg font-semibold mb-4">{t('select_language')}</h3>


            <img src={`images/V1/Language_selection/Language_selection_tab.png`} className="absolute size-full inset-0" alt="" />

            <div className="flex flex-col space-y-2 relative p-4 z-40">

              <div className= {buttonStyle}>
                <img
                  src={`images/V1/Language_selection/Language_selection_Button_01.png`}
                  alt="English"
                  onClick={() => changeLanguage('en')}
                />
                <p className='absolute pointer-events-none pb-2'>English</p>  
              </div>
              <div className= {buttonStyle}>
                <img
                  src={`images/V1/Language_selection/Language_selection_Button_02.png`}
                  alt="Français"
                  onClick={() => changeLanguage('fr')}
                />
                <p className='absolute pointer-events-none pb-2'>Français</p>
              </div>
              <div className= {buttonStyle}>
                <img
                  src={`images/V1/Language_selection/Language_selection_Button_03.png`}
                  alt="English"
                  onClick={() => changeLanguage('vn')}
                />
                <p className='absolute pointer-events-none pb-2'>Việt</p>
              </div>
              <div className= {buttonStyle}>
                <img
                  src={`images/V1/Language_selection/Language_selection_Button_04.png`}
                  alt="English"
                  onClick={() => changeLanguage('th')}
                />
                <p className='absolute pointer-events-none pb-2'>แบบไทย</p>
              </div>




            </div>


          </div>
        </div>
      )}
    </div>
  );
};

export default LanguageSelector;

