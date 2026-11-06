"use client";

import { forwardRef, useCallback, useEffect, useId, useLayoutEffect, useImperativeHandle, useRef, useState, type InputHTMLAttributes, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";
import { ChevronLeft, ChevronRight } from "lucide-react";

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, "type"> & {
  /** Taken periods (as fetchBookedRanges returns them): closed on the calendar. `ends` is the day the place is free again. */
  booked?: ReadonlyArray<{ starts: string; ends: string }>;
};
type Place = { above: number; below: number; start: number; rtl: boolean; top?: number; up?: boolean };

const WORDS = {
  // Weekday headers, Saturday first. Written out because Arabic has no short form: the browser gives the full name.
  ar: { choose: "اختار التاريخ", prev: "الشهر اللي فات", next: "الشهر الجاي", clear: "امسح", today: "النهارده", calendar: "اختار يوم", days: ["سبت", "حد", "اتنين", "تلات", "أربع", "خميس", "جمعة"] },
  en: { choose: "Choose a date", prev: "Previous month", next: "Next month", clear: "Clear", today: "Today", calendar: "Choose a day", days: ["Sat", "Sun", "Mon", "Tue", "Wed", "Thu", "Fri"] },
};

/** "YYYY-MM-DD" ⇄ a UTC day number, so time zones never shift the chosen day. */
const toDay = (value: string) => { const [y, m, d] = value.split("-").map(Number); return y && m && d ? Date.UTC(y, m - 1, d) / 864e5 : NaN; };
const toValue = (day: number) => new Date(day * 864e5).toISOString().slice(0, 10);
const todayDay = () => { const now = new Date(); return Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) / 864e5; };

function usesMouse() {
  return typeof window !== "undefined" && window.matchMedia("(hover: hover) and (pointer: fine)").matches;
}

/**
 * A date field. Phones keep their own date picker. On a computer the browser's box (which writes the
 * date in the browser's order, e.g. 11/26/2026) is swapped for the date in words in the page language
 * ("Thursday, 26 November 2026") and a Sakani calendar: weeks start on Saturday, days outside min/max
 * and `booked` periods are closed, arrows move by day, Page Up/Down by month, Enter chooses, Escape closes.
 * The real date input stays in the form, so its name, value, required and min/max checks work as before.
 * A phone's own picker can't close single days, so `booked` applies to the calendar only.
 */
const SakaniDate = forwardRef<HTMLInputElement, Props>(function SakaniDate(props, forwarded) {
  const { className, style, booked, ...rest } = props;
  const ref = useRef<HTMLInputElement>(null);
  const displayRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  useImperativeHandle(forwarded, () => ref.current!);
  const id = useId();
  const [mouse, setMouse] = useState(false);
  const [lang, setLang] = useState<"ar" | "en">("en");
  const [value, setValue] = useState(typeof props.value === "string" ? props.value : typeof props.defaultValue === "string" ? props.defaultValue : "");
  const [open, setOpen] = useState(false);
  const [place, setPlace] = useState<Place | null>(null);
  const [focusDay, setFocusDay] = useState(0);

  // After the first paint: computer or phone, and the page language.
  useEffect(() => {
    const input = ref.current;
    setMouse(usesMouse());
    setLang(input?.closest<HTMLElement>("[lang]")?.lang === "ar" ? "ar" : "en");
    if (!input) return;
    const sync = () => setValue(input.value);
    sync();
    input.addEventListener("input", sync);
    input.addEventListener("change", sync);
    const form = input.form;
    const onReset = () => window.setTimeout(sync);
    form?.addEventListener("reset", onReset);
    return () => {
      input.removeEventListener("input", sync);
      input.removeEventListener("change", sync);
      form?.removeEventListener("reset", onReset);
    };
  }, []);

  // A controlled value from the parent wins.
  useEffect(() => {
    if (typeof props.value === "string") setValue(props.value);
  }, [props.value]);

  const locale = lang === "ar" ? "ar-EG-u-nu-latn" : "en-GB";
  const words = WORDS[lang];
  const min = typeof props.min === "string" ? toDay(props.min) : NaN;
  const max = typeof props.max === "string" ? toDay(props.max) : NaN;
  const isBooked = (day: number) => booked?.some((range) => day >= toDay(range.starts) && day < toDay(range.ends)) ?? false;
  const allowed = (day: number) => !(day < min) && !(day > max) && !isBooked(day);
  const chosen = toDay(value);
  const text = Number.isNaN(chosen) ? "" : new Intl.DateTimeFormat(locale, { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(chosen * 864e5);

  const close = useCallback((refocus = true) => {
    setOpen(false);
    if (refocus) displayRef.current?.focus();
  }, []);

  function show() {
    const display = displayRef.current;
    if (!display || props.disabled || props.readOnly) return;
    const rect = display.getBoundingClientRect();
    const rtl = getComputedStyle(display).direction === "rtl" || lang === "ar";
    let start = Number.isNaN(chosen) ? todayDay() : chosen;
    if (start < min) start = min;
    if (start > max) start = max;
    while (isBooked(start)) start += 1;
    setFocusDay(start);
    setPlace({ above: rect.top - 6, below: rect.bottom + 6, start: rtl ? window.innerWidth - rect.right : rect.left, rtl });
    setOpen(true);
  }

  function commit(next: string) {
    const input = ref.current;
    if (!input) return;
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, next);
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
    setValue(next);
    close();
  }

  // Once drawn, measure the calendar and keep it fully on screen: below the field, else above it,
  // else as low as it fits (short laptop screens).
  useLayoutEffect(() => {
    const dialog = dialogRef.current;
    if (!open || !dialog || !place || place.top !== undefined) return;
    const height = dialog.offsetHeight;
    const room = window.innerHeight - 8;
    const fitsBelow = place.below + height <= room;
    const fitsAbove = place.above - height >= 8;
    const top = fitsBelow ? place.below : fitsAbove ? place.above - height : Math.max(8, room - height);
    setPlace({ ...place, top, up: !fitsBelow && fitsAbove });
  }, [open, place]);

  const placed = place?.top !== undefined;
  // Move focus to the highlighted day whenever it changes while open.
  useEffect(() => {
    if (open && placed) dialogRef.current?.querySelector<HTMLElement>(`[data-day="${focusDay}"]`)?.focus();
  }, [open, placed, focusDay]);

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!dialogRef.current?.contains(target) && target !== displayRef.current) close(false);
    };
    const onScroll = (event: Event) => { if (!dialogRef.current?.contains(event.target as Node)) close(false); };
    const onResize = () => close(false);
    document.addEventListener("pointerdown", onPointer);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onResize);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onResize);
    };
  }, [open, close]);

  function shiftMonth(day: number, months: number) {
    const date = new Date(day * 864e5);
    const target = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, 1));
    const last = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
    return Date.UTC(target.getUTCFullYear(), target.getUTCMonth(), Math.min(date.getUTCDate(), last)) / 864e5;
  }

  function onGridKey(event: KeyboardEvent<HTMLDivElement>) {
    const rtl = place?.rtl;
    const moves: Record<string, number> = { ArrowLeft: rtl ? 1 : -1, ArrowRight: rtl ? -1 : 1, ArrowUp: -7, ArrowDown: 7 };
    let next = focusDay;
    if (event.key in moves) {
      // Step over a booked stretch rather than stop at its edge.
      next = focusDay + moves[event.key];
      while (isBooked(next)) next += moves[event.key];
    }
    else if (event.key === "PageUp") next = shiftMonth(focusDay, -1);
    else if (event.key === "PageDown") next = shiftMonth(focusDay, 1);
    else if (event.key === "Home") next = focusDay - ((new Date(focusDay * 864e5).getUTCDay() + 1) % 7);
    else if (event.key === "End") next = focusDay + (6 - ((new Date(focusDay * 864e5).getUTCDay() + 1) % 7));
    else if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); close(); return; }
    else return;
    event.preventDefault();
    if (allowed(next)) setFocusDay(next);
  }

  function onDisplayKey(event: KeyboardEvent<HTMLInputElement>) {
    if (["Enter", " ", "ArrowDown", "F4"].includes(event.key)) { event.preventDefault(); show(); }
    else if ((event.key === "Backspace" || event.key === "Delete") && !props.required && value) { event.preventDefault(); commit(""); }
  }

  // The month on show: 6 weeks starting on the Saturday on or before the 1st.
  const focus = new Date(focusDay * 864e5);
  const first = Date.UTC(focus.getUTCFullYear(), focus.getUTCMonth(), 1) / 864e5;
  const gridStart = first - ((new Date(first * 864e5).getUTCDay() + 1) % 7);
  const days = Array.from({ length: 42 }, (_, index) => gridStart + index);
  const month = focus.getUTCMonth();
  const weekday = new Intl.DateTimeFormat(locale, { weekday: "long", timeZone: "UTC" });
  const dayLabel = new Intl.DateTimeFormat(locale, { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
  const title = new Intl.DateTimeFormat(locale, { month: "long", year: "numeric", timeZone: "UTC" }).format(first * 864e5);
  const prevMonthEnd = first - 1;
  const nextMonthStart = shiftMonth(first, 1);
  const today = todayDay();

  return (
    <>
      <input
        {...rest}
        ref={ref}
        type="date"
        className={mouse ? `${className ?? ""} sakani-date-native`.trim() : className}
        style={style}
        tabIndex={mouse ? -1 : props.tabIndex}
        aria-hidden={mouse || undefined}
        onFocus={(event) => { props.onFocus?.(event); if (mouse) displayRef.current?.focus(); }}
        onInvalid={(event) => { props.onInvalid?.(event); if (mouse) displayRef.current?.focus(); }}
      />
      {mouse && (
        <input
          ref={displayRef}
          type="text"
          readOnly
          role="combobox"
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-controls={open ? `${id}-calendar` : undefined}
          aria-invalid={props["aria-invalid"]}
          aria-required={props.required || undefined}
          aria-label={props["aria-label"]}
          id={props.id ? `${props.id}-display` : undefined}
          disabled={props.disabled}
          className={`${className ?? ""} sakani-date-display`.trim()}
          style={style}
          value={text}
          placeholder={words.choose}
          onClick={() => (open ? close() : show())}
          onKeyDown={onDisplayKey}
        />
      )}
      {open && place && createPortal(
        <div
          ref={dialogRef}
          id={`${id}-calendar`}
          role="dialog"
          aria-label={words.calendar}
          dir={place.rtl ? "rtl" : "ltr"}
          lang={lang}
          className={`sakani-calendar${place.up ? " is-up" : ""}`}
          style={{ top: place.top ?? place.below, visibility: place.top === undefined ? "hidden" : undefined, [place.rtl ? "right" : "left"]: place.start }}
          onKeyDown={(event) => { if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); close(); } }}
        >
          <div className="sakani-calendar-head">
            <button type="button" aria-label={words.prev} disabled={prevMonthEnd < min} onClick={() => setFocusDay(Math.max(shiftMonth(focusDay, -1), Number.isNaN(min) ? -Infinity : min))}>
              {place.rtl ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
            </button>
            <strong aria-live="polite">{title}</strong>
            <button type="button" aria-label={words.next} disabled={nextMonthStart > max} onClick={() => setFocusDay(Math.min(shiftMonth(focusDay, 1), Number.isNaN(max) ? Infinity : max))}>
              {place.rtl ? <ChevronLeft size={18} /> : <ChevronRight size={18} />}
            </button>
          </div>
          <div className="sakani-calendar-grid" role="grid" aria-label={title} onKeyDown={onGridKey}>
            <div role="row" className="sakani-calendar-week">
              {days.slice(0, 7).map((day, index) => <span role="columnheader" key={day} aria-label={weekday.format(day * 864e5)}>{words.days[index]}</span>)}
            </div>
            {[0, 1, 2, 3, 4, 5].map((week) => (
              <div role="row" className="sakani-calendar-week" key={week}>
                {days.slice(week * 7, week * 7 + 7).map((day) => {
                  const inMonth = new Date(day * 864e5).getUTCMonth() === month;
                  const ok = allowed(day);
                  return (
                    <button
                      key={day}
                      type="button"
                      role="gridcell"
                      data-day={day}
                      tabIndex={day === focusDay ? 0 : -1}
                      disabled={!ok}
                      aria-selected={day === chosen}
                      aria-current={day === today ? "date" : undefined}
                      aria-label={dayLabel.format(day * 864e5)}
                      className={`${inMonth ? "" : "is-outside"}${day === chosen ? " is-selected" : ""}${day === today ? " is-today" : ""}`}
                      onClick={() => commit(toValue(day))}
                      onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); commit(toValue(day)); } }}
                    >
                      {new Date(day * 864e5).getUTCDate()}
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
          <div className="sakani-calendar-foot">
            {allowed(today) && <button type="button" className="text-button" onClick={() => commit(toValue(today))}>{words.today}</button>}
            {!props.required && value && <button type="button" className="text-button" onClick={() => commit("")}>{words.clear}</button>}
          </div>
        </div>,
        document.body,
      )}
    </>
  );
});

export default SakaniDate;
