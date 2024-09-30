import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import translationEN from '../languages/english.json';
import translationFR from '../languages/french.json';
import translationVN from '../languages/viet.json';
import translationTH from '../languages/thai.json';


const resources = {
  en: {
    translation: translationEN
  },
  fr: {
    translation: translationFR
  }, 
  vn: {
    translation: translationVN
  },
  th: {
    translation: translationTH
  }

};

i18n
  .use(initReactI18next)
  .init({
    resources,
    lng: 'en', // Language by default
    fallbackLng: 'en',
    interpolation: {
      escapeValue: false 
    }
  });

export default i18n;
