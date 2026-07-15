import i18n from "i18next";
import { initReactI18next } from "react-i18next";

import translationEN from "../languages/english.json";
import translationFR from "../languages/french.json";
import translationTH from "../languages/thai.json";
import translationVN from "../languages/vietnamese.json";
import translationLA from "../languages/lao.json";
import translationKH from "../languages/khmer.json";

const resources = {
	en: {
		translation: translationEN,
	},
	fr: {
		translation: translationFR,
	},
	vi: {
		translation: translationVN,
	},
	th: {
		translation: translationTH,
	},
	lo: {
		translation: translationLA,
	},
	km: {
		translation: translationKH,
	},
};

i18n.use(initReactI18next).init({
	resources,
	lng: "en", // Language by default
	fallbackLng: "en",
	interpolation: {
		escapeValue: false,
	},
});

export default i18n;
