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
  | "status.openAlerts"
  | "dash.title"
  | "dash.activeHerd"
  | "dash.onFarm"
  | "dash.addCattle"
  | "dash.milkSheet"
  | "dash.kpi.herd"
  | "dash.kpi.milk"
  | "dash.kpi.pregnant"
  | "dash.kpi.alerts"
  | "dash.monthIncome"
  | "dash.monthExpense"
  | "dash.monthNet"
  | "milk.title"
  | "milk.totalToday"
  | "milk.totalDay"
  | "milk.cowsEntered"
  | "milk.notEntered"
  | "milk.avgEntered"
  | "milk.morning"
  | "milk.evening"
  | "milk.save"
  | "milk.allSheds"
  | "milk.settings"
  | "animals.title"
  | "animals.add"
  | "animals.qrSheets"
  | "animals.bulkCsv"
  | "animals.searchPlaceholder"
  | "animals.filter"
  | "animals.clear"
  | "animals.view.all"
  | "animals.view.active"
  | "animals.view.pregnant"
  | "animals.view.calves"
  | "animals.view.sold"
  | "scan.title"
  | "scan.desc";

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
    "dash.title": "Overview",
    "dash.activeHerd": "Active herd",
    "dash.onFarm": "On farm",
    "dash.addCattle": "+ Add cattle",
    "dash.milkSheet": "Milk sheet",
    "dash.kpi.herd": "HERD ON FARM",
    "dash.kpi.milk": "TODAY'S MILK",
    "dash.kpi.pregnant": "PREGNANT & AI",
    "dash.kpi.alerts": "OPEN ALERTS",
    "dash.monthIncome": "Month income",
    "dash.monthExpense": "Month expense",
    "dash.monthNet": "Month net",
    "milk.title": "Milk log",
    "milk.totalToday": "Total milk today",
    "milk.totalDay": "Total for this day",
    "milk.cowsEntered": "Cows entered",
    "milk.notEntered": "Lactating not entered",
    "milk.avgEntered": "Average entered",
    "milk.morning": "Morning (L)",
    "milk.evening": "Evening (L)",
    "milk.save": "Save",
    "milk.allSheds": "All sheds",
    "milk.settings": "Milk settings",
    "animals.title": "Cattle",
    "animals.add": "+ Add cattle",
    "animals.qrSheets": "QR sheets",
    "animals.bulkCsv": "Bulk & CSV",
    "animals.searchPlaceholder": "Search code, name, ear tag, RFID, sire…",
    "animals.filter": "Filter",
    "animals.clear": "Clear",
    "animals.view.all": "All",
    "animals.view.active": "On farm",
    "animals.view.pregnant": "Pregnant",
    "animals.view.calves": "Calves",
    "animals.view.sold": "Sold",
    "scan.title": "Scan",
    "scan.desc": "Open an animal from a QR tag, ear tag, or RFID — or scan a semen straw to start an insemination.",
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
    "dash.title": "फार्म डैशबोर्ड",
    "dash.activeHerd": "सक्रिय पशुधन",
    "dash.onFarm": "फार्म पर",
    "dash.addCattle": "+ नया पशु जोड़ें",
    "dash.milkSheet": "दूध शीट",
    "dash.kpi.herd": "फार्म पर पशु",
    "dash.kpi.milk": "आज का दूध",
    "dash.kpi.pregnant": "गाभिन व AI",
    "dash.kpi.alerts": "बाकी अलर्ट",
    "dash.monthIncome": "मासिक आय",
    "dash.monthExpense": "मासिक खर्च",
    "dash.monthNet": "शुद्ध बचत",
    "milk.title": "दूध रजिस्टर",
    "milk.totalToday": "आज का कुल दूध",
    "milk.totalDay": "इस दिन का कुल दूध",
    "milk.cowsEntered": "दर्ज की गई गायें",
    "milk.notEntered": "अभी दर्ज नहीं",
    "milk.avgEntered": "औसत दूध / पशु",
    "milk.morning": "सुबह (ली.)",
    "milk.evening": "शाम (ली.)",
    "milk.save": "सहेजें",
    "milk.allSheds": "सभी शेड",
    "milk.settings": "दूध सेटिंग्स",
    "animals.title": "पशु रजिस्टर",
    "animals.add": "+ नया पशु",
    "animals.qrSheets": "QR शीट",
    "animals.bulkCsv": "बल्क व CSV",
    "animals.searchPlaceholder": "कोड, नाम, टैग, RFID खोजें…",
    "animals.filter": "फ़िल्टर",
    "animals.clear": "साफ़ करें",
    "animals.view.all": "सभी",
    "animals.view.active": "फार्म पर",
    "animals.view.pregnant": "गाभिन",
    "animals.view.calves": "बछड़े",
    "animals.view.sold": "बिक चुके",
    "scan.title": "टैग / QR स्कैन",
    "scan.desc": "पशु प्रोफ़ाइल खोलने के लिए QR टैग, ईयर टैग या RFID स्कैन करें — या AI के लिए सीमन स्ट्रॉ स्कैन करें।",
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
    "dash.title": "ફાર્મ ડેશબોર્ડ",
    "dash.activeHerd": "સક્રિય પશુધન",
    "dash.onFarm": "ફાર્મ પર",
    "dash.addCattle": "+ નવું પશુ ઉમેરો",
    "dash.milkSheet": "દૂધ શીટ",
    "dash.kpi.herd": "ફાર્મ પર પશુ",
    "dash.kpi.milk": "આજનું દૂધ",
    "dash.kpi.pregnant": "ગાભણ અને AI",
    "dash.kpi.alerts": "બાકી એલર્ટ",
    "dash.monthIncome": "માસિક આવક",
    "dash.monthExpense": "માસિક ખર્ચ",
    "dash.monthNet": "ચોખ્ખો નફો",
    "milk.title": "દૂધ રજિસ્ટર",
    "milk.totalToday": "આજનું કુલ દૂધ",
    "milk.totalDay": "આ દિવસનું કુલ દૂધ",
    "milk.cowsEntered": "નોંધાયેલ ગાયો",
    "milk.notEntered": "નોંધણી બાકી",
    "milk.avgEntered": "સરેરાશ દૂધ",
    "milk.morning": "સવાર (લી.)",
    "milk.evening": "સાંજ (લી.)",
    "milk.save": "સાચવો",
    "milk.allSheds": "બધા શેડ",
    "milk.settings": "દૂધ સેટિંગ્સ",
    "animals.title": "પશુ રજિસ્ટર",
    "animals.add": "+ નવું પશુ",
    "animals.qrSheets": "QR શીટ",
    "animals.bulkCsv": "બલ્ક અને CSV",
    "animals.searchPlaceholder": "કોડ, નામ, ટેગ, RFID શોધો…",
    "animals.filter": "ફિલ્ટર",
    "animals.clear": "સાફ કરો",
    "animals.view.all": "બધા",
    "animals.view.active": "ફાર્મ પર",
    "animals.view.pregnant": "ગાભણ",
    "animals.view.calves": "વાછરડા",
    "animals.view.sold": "વેચાયેલા",
    "scan.title": "ટેગ / QR સ્કેન",
    "scan.desc": "પશુની વિગત જોવા QR ટેગ, ઇયર ટેગ અથવા RFID સ્કેન કરો — અથવા સીમેન સ્ટ્રો સ્કેન કરો.",
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
    "dash.title": "गोठा डॅशबोर्ड",
    "dash.activeHerd": "सक्रिय पशुधन",
    "dash.onFarm": "गोठ्यात",
    "dash.addCattle": "+ नवीन जनावर",
    "dash.milkSheet": "दूध नोंदणी",
    "dash.kpi.herd": "गोठ्यातील पशुधन",
    "dash.kpi.milk": "आजचे दूध",
    "dash.kpi.pregnant": "गाभण व AI",
    "dash.kpi.alerts": "प्रलंबित अलर्ट",
    "dash.monthIncome": "मासिक उत्पन्न",
    "dash.monthExpense": "मासिक खर्च",
    "dash.monthNet": "निव्वळ नफा",
    "milk.title": "दूध नोंदवही",
    "milk.totalToday": "आजचे एकूण दूध",
    "milk.totalDay": "या दिवसाचे एकूण दूध",
    "milk.cowsEntered": "नोंद झालेल्या गायी",
    "milk.notEntered": "नोंद बाकी",
    "milk.avgEntered": "सरासरी दूध",
    "milk.morning": "सकाळ (लि.)",
    "milk.evening": "संध्याकाळ (लि.)",
    "milk.save": "जतन करा",
    "milk.allSheds": "सर्व गोठे",
    "milk.settings": "दूध सेटिंग्ज",
    "animals.title": "पशुधन नोंदणी",
    "animals.add": "+ नवीन जनावर",
    "animals.qrSheets": "QR शीट",
    "animals.bulkCsv": "बल्क व CSV",
    "animals.searchPlaceholder": "कोड, नाव, टॅग, RFID शोधा…",
    "animals.filter": "फिल्टर",
    "animals.clear": "साफ करा",
    "animals.view.all": "सर्व",
    "animals.view.active": "गोठ्यात",
    "animals.view.pregnant": "गाभण",
    "animals.view.calves": "वासरे",
    "animals.view.sold": "विक्री झालेली",
    "scan.title": "टॅग / QR स्कॅन",
    "scan.desc": "जनावराची माहिती पाहण्यासाठी QR टॅग, कानातील टॅग किंवा RFID स्कॅन करा — किंवा सीमेन स्ट्रॉ स्कॅन करा.",
  },
};

export function t(locale: string | null | undefined, key: DictionaryKey): string {
  const code = normalizeLocale(locale);
  return dictionaries[code][key] ?? dictionaries.en[key];
}
