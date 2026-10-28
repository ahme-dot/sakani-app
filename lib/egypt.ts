import type { SiteLocale } from "@/messages/site";

/**
 * Locations across Egypt. Listings store the English governorate names as written here;
 * the neighbourhood ("area") is free text, with these areas offered as suggestions.
 */
export type Governorate = { id: string; name: string; name_en: string; areas: Array<{ name: string; name_en: string }> };

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

export const DEFAULT_GOVERNORATE = "Giza";

export function governorateLabel(locale: SiteLocale, name: string) {
  const match = GOVERNORATES.find((item) => item.name_en === name);
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
