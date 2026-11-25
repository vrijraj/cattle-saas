export type Locale = "en" | "hi" | "gu" | "mr";

export const LOCALES: { code: Locale; label: string; native: string }[] = [
  { code: "en", label: "English", native: "English" },
  { code: "hi", label: "Hindi", native: "हिन्दी" },
  { code: "gu", label: "Gujarati", native: "ગુજરાતી" },
  { code: "mr", label: "Marathi", native: "मराठी" },
];

export function normalizeLocale(value: string | null | undefined): Locale {
  if (value === "hi" || value === "gu" || value === "mr") return value;
  return "en";
}

export type DictionaryKey =
  | "nav.overview"
  | "nav.cattle"
  | "nav.ai"
  | "nav.reports"
  | "nav.sheds"
  | "nav.milk"
  | "nav.feed"
  | "nav.scan"
  | "nav.breeding"
  | "nav.semen"
  | "nav.genetics"
  | "nav.insights"
  | "nav.embryos"
  | "nav.health"
  | "nav.alerts"
  | "nav.listings"
  | "nav.shop"
  | "nav.enquiries"
  | "nav.finance"
  | "nav.settings"
  | "nav.team"
  | "nav.audit"
  | "nav.admin"
  | "group.herd"
  | "group.breeding"
  | "group.health"
  | "group.commerce"
  | "action.scanQr"
  | "action.publicPage"
  | "action.signOut"
  | "status.allClear"
  | "status.openAlerts";

const dictionaries: Record<Locale, Record<DictionaryKey, string>> = {
  en: {
    "nav.overview": "Overview",
    "nav.cattle": "Cattle register",
    "nav.ai": "AI Assistant",
    "nav.reports": "Reports",
    "nav.sheds": "Sheds & pens",
    "nav.milk": "Milk production",
    "nav.feed": "Feed & nutrition",
    "nav.scan": "Scan QR / Tag",
    "nav.breeding": "Reproduction & AI",
    "nav.semen": "Bulls & semen",
    "nav.genetics": "Pedigree & mating",
    "nav.insights": "Herd insights",
    "nav.embryos": "Embryos",
    "nav.health": "Veterinary & health",
    "nav.alerts": "Smart alerts",
    "nav.listings": "Public listings",
    "nav.shop": "Shop & orders",
    "nav.enquiries": "Buyer enquiries",
    "nav.finance": "Finance",
    "nav.settings": "Farm settings",
    "nav.team": "Team & roles",
    "nav.audit": "Audit log",
    "nav.admin": "Platform admin",
    "group.herd": "Herd & sheds",
    "group.breeding": "Breeding & genetics",
    "group.health": "Health & reminders",
    "group.commerce": "Public & shop",
    "action.scanQr": "Scan QR",
    "action.publicPage": "Public page",
    "action.signOut": "Sign out",
    "status.allClear": "All clear",
    "status.openAlerts": "open",
  },
  hi: {
    "nav.overview": "डैशबोर्ड",
    "nav.cattle": "पशु रजिस्टर",
    "nav.ai": "एआई सहायक",
    "nav.reports": "रिपोर्ट्स",
    "nav.sheds": "शेड व बाड़े",
    "nav.milk": "दूध उत्पादन",
    "nav.feed": "चारा व पोषण",
    "nav.scan": "QR / टैग स्कैन",
    "nav.breeding": "प्रजनन व AI",
    "nav.semen": "सांड व सीमन",
    "nav.genetics": "वंशावली व मिलान",
    "nav.insights": "फार्म विश्लेषण",
    "nav.embryos": "भ्रूण (एम्ब्रियो)",
    "nav.health": "पशु चिकित्सा व दवा",
    "nav.alerts": "स्मार्ट अलर्ट",
    "nav.listings": "पब्लिक कैटलॉग",
    "nav.shop": "दुकान व ऑर्डर",
    "nav.enquiries": "खरीदार पूछताछ",
    "nav.finance": "आय-व्यय (खाता)",
    "nav.settings": "फार्म सेटिंग्स",
    "nav.team": "टीम व भूमिकाएँ",
    "nav.audit": "ऑडिट लॉग",
    "nav.admin": "प्लेटफ़ॉर्म एडमिन",
    "group.herd": "पशुधन व शेड",
    "group.breeding": "प्रजनन व नस्ल",
    "group.health": "स्वास्थ्य व अलर्ट",
    "group.commerce": "पब्लिक व दुकान",
    "action.scanQr": "QR स्कैन",
    "action.publicPage": "पब्लिक पेज",
    "action.signOut": "लॉग आउट",
    "status.allClear": "सब ठीक है",
    "status.openAlerts": "बाकी",
  },
  gu: {
    "nav.overview": "ડેશબોર્ડ",
    "nav.cattle": "પશુ રજિસ્ટર",
    "nav.ai": "AI સહાયક",
    "nav.reports": "રિપોર્ટ્સ",
    "nav.sheds": "શેડ અને વાડા",
    "nav.milk": "દૂધ ઉત્પાદન",
    "nav.feed": "ઘાસચારો અને ખાણ",
    "nav.scan": "QR / ટેગ સ્કેન",
    "nav.breeding": "સંવર્ધન અને AI",
    "nav.semen": "સાંઢ અને સીમેન",
    "nav.genetics": "વંશાવળી અને મેટિંગ",
    "nav.insights": "ડેરી વિશ્લેષણ",
    "nav.embryos": "ભ્રૂણ (એમ્બ્રિયો)",
    "nav.health": "આરોગ્ય અને દવા",
    "nav.alerts": "સ્માર્ટ એલર્ટ",
    "nav.listings": "પબ્લિક કેટલોગ",
    "nav.shop": "દુકાન અને ઓર્ડર",
    "nav.enquiries": "ખરીદદાર પૂછપરછ",
    "nav.finance": "હિસાબ-કિતાબ",
    "nav.settings": "ફાર્મ સેટિંગ્સ",
    "nav.team": "ટીમ અને ભૂમિકાઓ",
    "nav.audit": "ઓડિટ લોગ",
    "nav.admin": "પ્લેટફોર્મ એડમિન",
    "group.herd": "પશુધન અને શેડ",
    "group.breeding": "સંવર્ધન અને નસ્લ",
    "group.health": "આરોગ્ય અને યાદી",
    "group.commerce": "પબ્લિક અને દુકાન",
    "action.scanQr": "QR સ્કેન",
    "action.publicPage": "પબ્લિક પેજ",
    "action.signOut": "લોગ આઉટ",
    "status.allClear": "બધું બરાબર",
    "status.openAlerts": "બાકી",
  },
  mr: {
    "nav.overview": "डॅशबोर्ड",
    "nav.cattle": "पशुधन नोंदणी",
    "nav.ai": "AI सहाय्यक",
    "nav.reports": "अहवाल",
    "nav.sheds": "गोठे व विभाग",
    "nav.milk": "दूध उत्पादन",
    "nav.feed": "चारा व पोषण",
    "nav.scan": "QR / टॅग स्कॅन",
    "nav.breeding": "प्रजनन व AI",
    "nav.semen": "वळू व सीमेन",
    "nav.genetics": "वंशावळ व जुळणी",
    "nav.insights": "गोठा विश्लेषण",
    "nav.embryos": "भ्रूण (एम्ब्रियो)",
    "nav.health": "आरोग्य व औषधे",
    "nav.alerts": "स्मार्ट अलर्ट",
    "nav.listings": "पब्लिक कॅटलॉग",
    "nav.shop": "दुकान व ऑर्डर",
    "nav.enquiries": "खरेदीदार चौकशी",
    "nav.finance": "हिशेब व अर्थ",
    "nav.settings": "फार्म सेटिंग्ज",
    "nav.team": "टीम व जबाबदारी",
    "nav.audit": "ऑडिट लॉग",
    "nav.admin": "प्लॅटफॉर्म ॲडमिन",
    "group.herd": "पशुधन व गोठे",
    "group.breeding": "प्रजनन व वंश",
    "group.health": "आरोग्य व सूचना",
    "group.commerce": "पब्लिक व दुकान",
    "action.scanQr": "QR स्कॅन",
    "action.publicPage": "पब्लिक पेज",
    "action.signOut": "लॉग आउट",
    "status.allClear": "सर्व सुरळीत",
    "status.openAlerts": "प्रलंबित",
  },
};

export function t(locale: string | null | undefined, key: DictionaryKey): string {
  const code = normalizeLocale(locale);
  return dictionaries[code][key] ?? dictionaries.en[key];
}
