import i18n from "i18next";
import LanguageDetector from "i18next-browser-languagedetector";
import { initReactI18next } from "react-i18next";

import translationEN from "../languages/english.json";
import translationFR from "../languages/french.json";
import translationKH from "../languages/khmer.json";
import translationLA from "../languages/lao.json";
import translationTH from "../languages/thai.json";
import translationVN from "../languages/vietnamese.json";

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

i18n
	.use(LanguageDetector)
	.use(initReactI18next)
	.init({
		resources,
		fallbackLng: "en",
		// Only the languages we actually ship, so region variants
		// like "fr-FR" resolve to their base "fr" entry.
		supportedLngs: ["en", "fr", "vi", "th", "lo", "km"],
		nonExplicitSupportedLngs: true,
		interpolation: {
			escapeValue: false,
		},
		detection: {
			// localStorage first so a manual user choice sticks,
			// then fall back to the browser language.
			order: ["localStorage", "navigator", "htmlTag"],
			caches: ["localStorage"],
		},
	});

export default i18n;
