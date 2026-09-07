import { setCurrentLang } from "../src/i18n/lang";

// Unit tests read Nonno's sentences in Italian regardless of the machine's locale (CI runs in English).
setCurrentLang("it");
