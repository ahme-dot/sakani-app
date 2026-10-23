import type { SiteLocale } from "@/messages/site";

/**
 * Locations across Egypt. Listings store the English names (governorate, university) as written here;
 * the neighbourhood ("area") is free text, with these areas offered as suggestions.
 */
export type Governorate = { id: string; name: string; name_en: string; areas: Array<{ name: string; name_en: string }> };
export type University = { name: string; name_en: string; governorate: string };

const a = (name: string, name_en: string) => ({ name, name_en });

export const GOVERNORATES: Governorate[] = [
  { id: "cairo", name: "القاهرة", name_en: "Cairo", areas: [a("مدينة نصر", "Nasr City"), a("العباسية", "Abbassia"), a("مصر الجديدة", "Heliopolis"), a("القاهرة الجديدة", "New Cairo"), a("التجمع الخامس", "Fifth Settlement"), a("المعادي", "Maadi"), a("حلوان", "Helwan"), a("الشروق", "Shorouk"), a("عين شمس", "Ain Shams"), a("وسط البلد", "Downtown"), a("الزمالك", "Zamalek")] },
  { id: "giza", name: "الجيزة", name_en: "Giza", areas: [a("الدقي", "Dokki"), a("بين السرايات", "Bayn Al Sarayat"), a("المهندسين", "Mohandessin"), a("العجوزة", "Agouza"), a("فيصل", "Faisal"), a("الهرم", "Haram"), a("السادس من أكتوبر", "6th of October"), a("الشيخ زايد", "Sheikh Zayed"), a("حدائق أكتوبر", "October Gardens"), a("الواحات", "Oasis"), a("إمبابة", "Imbaba")] },
  { id: "alexandria", name: "الإسكندرية", name_en: "Alexandria", areas: [a("الشاطبي", "Shatby"), a("سبورتنج", "Sporting"), a("سموحة", "Smouha"), a("محرم بك", "Moharam Bek"), a("كليوباترا", "Cleopatra"), a("سيدي بشر", "Sidi Bishr"), a("ميامي", "Miami"), a("ستانلي", "Stanley"), a("أبو قير", "Abu Qir"), a("العجمي", "Agami")] },
  { id: "qalyubia", name: "القليوبية", name_en: "Qalyubia", areas: [a("بنها", "Benha"), a("شبرا الخيمة", "Shubra El Kheima"), a("القناطر الخيرية", "El Qanater")] },
  { id: "sharqia", name: "الشرقية", name_en: "Sharqia", areas: [a("الزقازيق", "Zagazig"), a("العاشر من رمضان", "10th of Ramadan"), a("بلبيس", "Belbeis")] },
  { id: "dakahlia", name: "الدقهلية", name_en: "Dakahlia", areas: [a("المنصورة", "Mansoura"), a("طلخا", "Talkha"), a("ميت غمر", "Mit Ghamr")] },
  { id: "gharbia", name: "الغربية", name_en: "Gharbia", areas: [a("طنطا", "Tanta"), a("المحلة الكبرى", "El Mahalla El Kubra")] },
  { id: "monufia", name: "المنوفية", name_en: "Monufia", areas: [a("شبين الكوم", "Shebin El Kom"), a("مدينة السادات", "Sadat City")] },
  { id: "kafr-el-sheikh", name: "كفر الشيخ", name_en: "Kafr El Sheikh", areas: [a("كفر الشيخ", "Kafr El Sheikh City"), a("دسوق", "Desouk")] },
  { id: "beheira", name: "البحيرة", name_en: "Beheira", areas: [a("دمنهور", "Damanhour"), a("كفر الدوار", "Kafr El Dawar")] },
  { id: "damietta", name: "دمياط", name_en: "Damietta", areas: [a("دمياط الجديدة", "New Damietta"), a("دمياط", "Damietta City")] },
  { id: "port-said", name: "بورسعيد", name_en: "Port Said", areas: [a("بورسعيد", "Port Said City"), a("بورفؤاد", "Port Fouad")] },
  { id: "ismailia", name: "الإسماعيلية", name_en: "Ismailia", areas: [a("الإسماعيلية", "Ismailia City"), a("الشيخ زايد (الإسماعيلية)", "Sheikh Zayed (Ismailia)")] },
  { id: "suez", name: "السويس", name_en: "Suez", areas: [a("السويس", "Suez City"), a("الأربعين", "Al Arbaeen")] },
  { id: "fayoum", name: "الفيوم", name_en: "Fayoum", areas: [a("الفيوم", "Fayoum City")] },
  { id: "beni-suef", name: "بني سويف", name_en: "Beni Suef", areas: [a("بني سويف", "Beni Suef City"), a("بني سويف الجديدة", "New Beni Suef")] },
  { id: "minya", name: "المنيا", name_en: "Minya", areas: [a("المنيا", "Minya City"), a("المنيا الجديدة", "New Minya")] },
  { id: "assiut", name: "أسيوط", name_en: "Assiut", areas: [a("أسيوط", "Assiut City"), a("أسيوط الجديدة", "New Assiut")] },
  { id: "sohag", name: "سوهاج", name_en: "Sohag", areas: [a("سوهاج", "Sohag City"), a("سوهاج الجديدة", "New Sohag")] },
  { id: "qena", name: "قنا", name_en: "Qena", areas: [a("قنا", "Qena City")] },
  { id: "luxor", name: "الأقصر", name_en: "Luxor", areas: [a("الأقصر", "Luxor City")] },
  { id: "aswan", name: "أسوان", name_en: "Aswan", areas: [a("أسوان", "Aswan City"), a("أسوان الجديدة", "New Aswan")] },
  { id: "red-sea", name: "البحر الأحمر", name_en: "Red Sea", areas: [a("الغردقة", "Hurghada")] },
  { id: "new-valley", name: "الوادي الجديد", name_en: "New Valley", areas: [a("الخارجة", "Kharga")] },
  { id: "matrouh", name: "مطروح", name_en: "Matrouh", areas: [a("مرسى مطروح", "Marsa Matrouh")] },
  { id: "north-sinai", name: "شمال سيناء", name_en: "North Sinai", areas: [a("العريش", "Arish")] },
  { id: "south-sinai", name: "جنوب سيناء", name_en: "South Sinai", areas: [a("الطور", "El Tor"), a("شرم الشيخ", "Sharm El Sheikh")] },
];

const u = (name: string, name_en: string, governorate: string): University => ({ name, name_en, governorate });

/** Main universities by governorate. "Cairo University", "Ain Shams University", "AUC" and "October 6 University" match older listings. */
export const UNIVERSITIES: University[] = [
  u("جامعة القاهرة", "Cairo University", "Giza"),
  u("جامعة 6 أكتوبر", "October 6 University", "Giza"),
  u("جامعة مصر للعلوم والتكنولوجيا", "Misr University for Science and Technology", "Giza"),
  u("جامعة أكتوبر للعلوم الحديثة والآداب", "MSA University", "Giza"),
  u("جامعة النيل", "Nile University", "Giza"),
  u("جامعة زويل", "Zewail City", "Giza"),
  u("جامعة عين شمس", "Ain Shams University", "Cairo"),
  u("الجامعة الأمريكية بالقاهرة", "AUC", "Cairo"),
  u("جامعة الأزهر", "Al-Azhar University", "Cairo"),
  u("جامعة حلوان", "Helwan University", "Cairo"),
  u("الجامعة الألمانية بالقاهرة", "German University in Cairo", "Cairo"),
  u("الجامعة البريطانية في مصر", "British University in Egypt", "Cairo"),
  u("جامعة المستقبل", "Future University in Egypt", "Cairo"),
  u("جامعة مصر الدولية", "Misr International University", "Cairo"),
  u("جامعة الإسكندرية", "Alexandria University", "Alexandria"),
  u("الأكاديمية العربية للعلوم والتكنولوجيا", "Arab Academy for Science and Technology", "Alexandria"),
  u("جامعة فاروس", "Pharos University", "Alexandria"),
  u("جامعة بنها", "Benha University", "Qalyubia"),
  u("جامعة الزقازيق", "Zagazig University", "Sharqia"),
  u("جامعة المنصورة", "Mansoura University", "Dakahlia"),
  u("جامعة طنطا", "Tanta University", "Gharbia"),
  u("جامعة المنوفية", "Menoufia University", "Monufia"),
  u("جامعة كفر الشيخ", "Kafrelsheikh University", "Kafr El Sheikh"),
  u("جامعة دمنهور", "Damanhour University", "Beheira"),
  u("جامعة دمياط", "Damietta University", "Damietta"),
  u("جامعة بورسعيد", "Port Said University", "Port Said"),
  u("جامعة قناة السويس", "Suez Canal University", "Ismailia"),
  u("جامعة السويس", "Suez University", "Suez"),
  u("جامعة الفيوم", "Fayoum University", "Fayoum"),
  u("جامعة بني سويف", "Beni-Suef University", "Beni Suef"),
  u("جامعة المنيا", "Minia University", "Minya"),
  u("جامعة أسيوط", "Assiut University", "Assiut"),
  u("جامعة سوهاج", "Sohag University", "Sohag"),
  u("جامعة جنوب الوادي", "South Valley University", "Qena"),
  u("جامعة الأقصر", "Luxor University", "Luxor"),
  u("جامعة أسوان", "Aswan University", "Aswan"),
  u("جامعة الوادي الجديد", "New Valley University", "New Valley"),
  u("جامعة مطروح", "Matrouh University", "Matrouh"),
  u("جامعة العريش", "Arish University", "North Sinai"),
];

/** Saved for homes not near any listed university. */
export const OTHER_UNIVERSITY = "Other";

export const DEFAULT_GOVERNORATE = "Giza";

export function universitiesIn(governorate: string) {
  return governorate ? UNIVERSITIES.filter((university) => university.governorate === governorate) : UNIVERSITIES;
}

export function governorateLabel(locale: SiteLocale, name: string) {
  const match = GOVERNORATES.find((item) => item.name_en === name);
  return match ? (locale === "ar" ? match.name : match.name_en) : name;
}

export function universityLabel(locale: SiteLocale, name: string) {
  if (name === OTHER_UNIVERSITY) return locale === "ar" ? "جامعة أخرى" : "Other university";
  const match = UNIVERSITIES.find((item) => item.name_en === name);
  return match ? (locale === "ar" ? match.name : match.name_en) : name;
}

/** Known neighbourhoods are translated; anything an owner typed is shown as written. */
export function areaLabel(locale: SiteLocale, name: string) {
  for (const governorate of GOVERNORATES) {
    const match = governorate.areas.find((item) => item.name_en === name || item.name === name);
    if (match) return locale === "ar" ? match.name : match.name_en;
  }
  return name;
}

/** "Dokki, Giza" / "الدقي، الجيزة". */
export function placeLabel(locale: SiteLocale, area: string, governorate: string) {
  const parts = [areaLabel(locale, area), governorateLabel(locale, governorate || DEFAULT_GOVERNORATE)];
  return parts.join(locale === "ar" ? "، " : ", ");
}

/** Neighbourhood suggestions for a governorate (both languages, for the owner's typing). */
export function areaSuggestions(locale: SiteLocale, governorate: string) {
  const list = GOVERNORATES.find((item) => item.name_en === governorate)?.areas ?? [];
  return list.map((item) => (locale === "ar" ? item.name : item.name_en));
}

/** Stores a typed neighbourhood: a known Arabic name becomes its English key, so it translates on the English site. */
export function normalizeArea(input: string) {
  const value = input.trim().replace(/\s+/g, " ");
  for (const governorate of GOVERNORATES) {
    const match = governorate.areas.find((item) => item.name === value || item.name_en.toLowerCase() === value.toLowerCase());
    if (match) return match.name_en;
  }
  return value;
}
