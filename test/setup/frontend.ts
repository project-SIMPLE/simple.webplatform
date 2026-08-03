// Frontend test setup: jest-dom matchers, DOM cleanup, and a minimal i18n
// instance so components using `useTranslation()` render real English strings
// without the browser language-detector.
import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import { afterEach } from "vitest";
import english from "../../src/languages/english.json";

if (!i18n.isInitialized) {
	i18n.use(initReactI18next).init({
		resources: { en: { translation: english } },
		lng: "en",
		fallbackLng: "en",
		interpolation: { escapeValue: false },
	});
}

afterEach(() => {
	cleanup();
});
