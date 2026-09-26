"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { universities, areas } from "@/lib/data";
import { Search } from "lucide-react";

export default function SearchSection({ locale }: { locale: string }) {
  const router = useRouter();
  const [filters, setFilters] = useState({
    university: "",
    area: "",
    gender: "",
  });

  const handleSearch = () => {
    const params = new URLSearchParams();
    if (filters.university) params.append("university", filters.university);
    if (filters.area) params.append("area", filters.area);
    if (filters.gender) params.append("gender", filters.gender);

    router.push(`/${locale}/listings?${params.toString()}`);
  };

  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <div className="rounded-2xl bg-white p-6 shadow-xl">
        <h2 className="mb-6 text-2xl font-bold text-slate-900">
          {locale === "ar" ? "ابحث عن السكن المناسب" : "Find Your Housing"}
        </h2>

        <div className="grid gap-4 md:grid-cols-4">
          {/* University */}
          <div>
            <label className="mb-2 block text-sm font-semibold text-slate-700">
              {locale === "ar" ? "الجامعة" : "University"}
            </label>
            <select
              value={filters.university}
              onChange={(e) =>
                setFilters({ ...filters, university: e.target.value })
              }
              className="w-full rounded-lg border border-slate-200 px-4 py-3 outline-none focus:border-indigo-500 transition"
            >
              <option value="">
                {locale === "ar" ? "اختر جامعة" : "Select university"}
              </option>
              {universities.map((uni) => (
                <option key={uni.id} value={uni.name}>
                  {locale === "ar" ? uni.name : uni.name_en}
                </option>
              ))}
            </select>
          </div>

          {/* Area */}
          <div>
            <label className="mb-2 block text-sm font-semibold text-slate-700">
              {locale === "ar" ? "المنطقة" : "Area"}
            </label>
            <select
              value={filters.area}
              onChange={(e) =>
                setFilters({ ...filters, area: e.target.value })
              }
              className="w-full rounded-lg border border-slate-200 px-4 py-3 outline-none focus:border-indigo-500 transition"
            >
              <option value="">
                {locale === "ar" ? "اختر منطقة" : "Select area"}
              </option>
              {areas.map((area) => (
                <option key={area.id} value={area.name}>
                  {locale === "ar" ? area.name : area.name_en}
                </option>
              ))}
            </select>
          </div>

          {/* Gender */}
          <div>
            <label className="mb-2 block text-sm font-semibold text-slate-700">
              {locale === "ar" ? "النوع" : "Gender"}
            </label>
            <select
              value={filters.gender}
              onChange={(e) =>
                setFilters({ ...filters, gender: e.target.value })
              }
              className="w-full rounded-lg border border-slate-200 px-4 py-3 outline-none focus:border-indigo-500 transition"
            >
              <option value="">
                {locale === "ar" ? "الكل" : "All"}
              </option>
              <option value="male">
                {locale === "ar" ? "شباب" : "Male"}
              </option>
              <option value="female">
                {locale === "ar" ? "بنات" : "Female"}
              </option>
              <option value="mixed">
                {locale === "ar" ? "مختلط" : "Mixed"}
              </option>
            </select>
          </div>

          {/* Search Button */}
          <div className="flex items-end">
            <button
              onClick={handleSearch}
              className="w-full flex items-center justify-center gap-2 rounded-lg bg-indigo-600 px-6 py-3 font-bold text-white hover:bg-indigo-700 transition"
            >
              <Search size={20} />
              {locale === "ar" ? "ابحث" : "Search"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}