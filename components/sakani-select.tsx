"use client";

import { forwardRef, useCallback, useEffect, useId, useImperativeHandle, useRef, useState, type KeyboardEvent, type MouseEvent, type SelectHTMLAttributes } from "react";
import { createPortal } from "react-dom";
import { Check } from "lucide-react";

type Option = { value: string; label: string; disabled: boolean };
type Place = { top: number; start: number; width: number; maxHeight: number; up: boolean; rtl: boolean; selected: number };

/** True on a computer with a mouse; phones and tablets keep their own picker, which suits touch best. */
function usesMouse() {
  return typeof window !== "undefined" && window.matchMedia("(hover: hover) and (pointer: fine)").matches;
}

/**
 * A real <select> (same form name, value, required check and styling as before) that, on a computer,
 * opens a Sakani-styled list instead of the browser's own one. Focus stays on the select, so keyboard
 * and screen-reader use is the native one: arrows move, Enter or Space choose, Escape closes, typing
 * jumps to an option. The list is drawn at the page root so modals and tables never cut it off.
 */
const SakaniSelect = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(function SakaniSelect(props, forwarded) {
  const { onMouseDown, onKeyDown, className, ...rest } = props;
  const ref = useRef<HTMLSelectElement>(null);
  useImperativeHandle(forwarded, () => ref.current!);
  const id = useId();
  const [open, setOpen] = useState(false);
  const [options, setOptions] = useState<Option[]>([]);
  const [active, setActive] = useState(0);
  const [place, setPlace] = useState<Place | null>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const typed = useRef({ text: "", at: 0 });

  const close = useCallback(() => setOpen(false), []);

  function show() {
    const select = ref.current;
    if (!select || select.disabled) return;
    const list = [...select.options].map((option) => ({ value: option.value, label: option.text, disabled: option.disabled }));
    const rect = select.getBoundingClientRect();
    const below = window.innerHeight - rect.bottom - 12;
    const above = rect.top - 12;
    const wanted = Math.min(320, list.length * 42 + 14);
    const up = below < Math.min(wanted, 200) && above > below;
    setOptions(list);
    setActive(Math.max(0, select.selectedIndex));
    const rtl = getComputedStyle(select).direction === "rtl";
    setPlace({
      top: up ? rect.top - 6 : rect.bottom + 6,
      start: rtl ? window.innerWidth - rect.right : rect.left,
      width: rect.width,
      maxHeight: Math.max(120, Math.min(320, up ? above : below)),
      up, rtl, selected: select.selectedIndex,
    });
    setOpen(true);
  }

  function choose(index: number) {
    const select = ref.current;
    const option = options[index];
    if (!select || !option || option.disabled) return;
    if (select.value !== option.value) {
      // The native setter, then a real change event, so React's onChange and plain forms both see it.
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")!.set!.call(select, option.value);
      select.dispatchEvent(new Event("input", { bubbles: true }));
      select.dispatchEvent(new Event("change", { bubbles: true }));
    }
    setOpen(false);
    select.focus();
  }

  function move(from: number, step: number) {
    for (let index = from + step; index >= 0 && index < options.length; index += step) if (!options[index].disabled) return index;
    return from;
  }

  function handleMouseDown(event: MouseEvent<HTMLSelectElement>) {
    onMouseDown?.(event);
    if (event.defaultPrevented || event.button !== 0 || !usesMouse()) return;
    event.preventDefault();
    ref.current?.focus();
    if (open) close();
    else show();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLSelectElement>) {
    onKeyDown?.(event);
    if (event.defaultPrevented || !usesMouse()) return;
    const key = event.key;
    if (!open) {
      if (key === " " || key === "Enter" || key === "F4" || (event.altKey && (key === "ArrowDown" || key === "ArrowUp"))) {
        event.preventDefault();
        show();
      }
      return; // Arrows and letters on a closed select keep their native behaviour.
    }
    const last = options.length - 1;
    if (key === "ArrowDown") setActive((index) => move(index, 1));
    else if (key === "ArrowUp") setActive((index) => move(index, -1));
    else if (key === "Home") setActive(move(-1, 1));
    else if (key === "End") setActive(move(last + 1, -1));
    else if (key === "PageDown") setActive((index) => Math.min(last, index + 7));
    else if (key === "PageUp") setActive((index) => Math.max(0, index - 7));
    else if (key === "Enter" || (key === " " && event.timeStamp - typed.current.at > 700)) choose(active);
    else if (key === "Escape") { event.stopPropagation(); close(); } // only the list closes, not a modal around it
    else if (key === "Tab") { close(); return; }
    else if (key.length === 1 && !event.ctrlKey && !event.metaKey) {
      typed.current = { text: event.timeStamp - typed.current.at < 700 ? typed.current.text + key : key, at: event.timeStamp };
      const text = typed.current.text.toLocaleLowerCase();
      const match = options.findIndex((option) => !option.disabled && option.label.toLocaleLowerCase().startsWith(text));
      if (match >= 0) setActive(match);
    } else return;
    event.preventDefault();
  }

  // Close on a click elsewhere, on scroll (the list is fixed to where the field was) and on resize.
  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!listRef.current?.contains(target) && target !== ref.current) close();
    };
    const onScroll = (event: Event) => { if (!listRef.current?.contains(event.target as Node)) close(); };
    document.addEventListener("pointerdown", onPointer);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", close);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", close);
    };
  }, [open, close]);

  useEffect(() => {
    if (open) listRef.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [open, active]);

  const selected = place?.selected ?? -1;

  return (
    <>
      <select
        {...rest}
        ref={ref}
        className={className}
        aria-expanded={open || undefined}
        aria-controls={open ? `${id}-list` : undefined}
        aria-activedescendant={open ? `${id}-option-${active}` : undefined}
        onMouseDown={handleMouseDown}
        onKeyDown={handleKeyDown}
      />
      {open && place && createPortal(
        <ul
          ref={listRef}
          id={`${id}-list`}
          role="listbox"
          dir={place.rtl ? "rtl" : "ltr"}
          className={`sakani-select-list${place.up ? " is-up" : ""}`}
          style={{ top: place.up ? undefined : place.top, bottom: place.up ? window.innerHeight - place.top : undefined, [place.rtl ? "right" : "left"]: place.start, minWidth: place.width, maxHeight: place.maxHeight }}
        >
          {options.map((option, index) => (
            <li
              key={`${option.value}-${index}`}
              id={`${id}-option-${index}`}
              data-index={index}
              role="option"
              aria-selected={index === selected}
              aria-disabled={option.disabled || undefined}
              className={`${index === active ? "is-active" : ""}${index === selected ? " is-selected" : ""}`}
              onPointerMove={() => !option.disabled && setActive(index)}
              onPointerDown={(event) => event.preventDefault()}
              onClick={() => choose(index)}
            >
              <span>{option.label}</span>
              {index === selected && <Check size={15} aria-hidden="true" />}
            </li>
          ))}
        </ul>,
        document.body,
      )}
    </>
  );
});

export default SakaniSelect;
