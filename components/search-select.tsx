"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { Check, ChevronDown } from "lucide-react";

export type SearchOption = { value: string; label: string };

type Props = {
  label: string;
  value: string;
  options: SearchOption[];
  onChange: (value: string) => void;
};

/**
 * One part of the desktop search: a button showing the choice, opening a Sakani-styled list under it
 * (the browser's own dropdown looked out of place over the hero). Works like a native select from the
 * keyboard — arrows, Home/End, Enter or Space to choose, Escape to close, typing a letter jumps to it —
 * and tells screen readers it is a listbox with the chosen option.
 */
export default function SearchSelect({ label, value, options, onChange }: Props) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const typed = useRef({ text: "", at: 0 });
  const selectedIndex = Math.max(0, options.findIndex((option) => option.value === value));
  const current = options[selectedIndex];

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onPointer);
    return () => document.removeEventListener("pointerdown", onPointer);
  }, [open]);

  // Keep the highlighted option in view while moving through a long list (27 governorates).
  useEffect(() => {
    if (!open) return;
    listRef.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [open, active]);

  function show(index = selectedIndex) {
    setActive(index);
    setOpen(true);
  }

  function choose(index: number) {
    onChange(options[index].value);
    setOpen(false);
    buttonRef.current?.focus();
  }

  function jumpTo(key: string, now: number) {
    typed.current = { text: now - typed.current.at < 700 ? typed.current.text + key : key, at: now };
    const match = options.findIndex((option) => option.label.toLocaleLowerCase().startsWith(typed.current.text.toLocaleLowerCase()));
    if (match >= 0) setActive(match);
  }

  // Focus stays on the button the whole time (the "select-only combobox" pattern), so fast key presses
  // right after opening can never land before the list is ready.
  function onKey(event: KeyboardEvent<HTMLButtonElement>) {
    if (!open) {
      if (["ArrowDown", "ArrowUp", "Enter", " "].includes(event.key)) {
        event.preventDefault();
        show(event.key === "ArrowUp" ? Math.max(0, selectedIndex - 1) : selectedIndex);
      } else if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
        show();
        jumpTo(event.key, event.timeStamp);
      }
      return;
    }
    const last = options.length - 1;
    if (event.key === "ArrowDown") setActive((index) => Math.min(last, index + 1));
    else if (event.key === "ArrowUp") setActive((index) => Math.max(0, index - 1));
    else if (event.key === "Home") setActive(0);
    else if (event.key === "End") setActive(last);
    else if (event.key === "Enter" || (event.key === " " && event.timeStamp - typed.current.at > 700)) choose(active);
    else if (event.key === "Escape") {
      setOpen(false);
    } else if (event.key === "Tab") {
      setOpen(false);
      return;
    } else if (event.key.length === 1) jumpTo(event.key, event.timeStamp);
    else return;
    event.preventDefault();
  }

  return (
    <div className={`search-seg search-select${open ? " is-open" : ""}`} ref={rootRef}>
      <button
        ref={buttonRef}
        type="button"
        role="combobox"
        className="search-select-button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={`${id}-list`}
        aria-activedescendant={open ? `${id}-option-${active}` : undefined}
        aria-labelledby={`${id}-label ${id}-value`}
        onClick={() => (open ? setOpen(false) : show())}
        onKeyDown={onKey}
      >
        <span className="search-seg-label" id={`${id}-label`}>{label}</span>
        <span className="search-seg-value" id={`${id}-value`}>{current?.label}</span>
        <ChevronDown className="search-select-chevron" size={14} aria-hidden="true" />
      </button>
      {open && (
        <ul
          ref={listRef}
          id={`${id}-list`}
          className="search-select-list"
          role="listbox"
          aria-labelledby={`${id}-label`}
        >
          {options.map((option, index) => (
            <li
              key={option.value || "any"}
              id={`${id}-option-${index}`}
              data-index={index}
              role="option"
              aria-selected={index === selectedIndex}
              className={`${index === active ? "is-active" : ""}${index === selectedIndex ? " is-selected" : ""}`}
              onPointerMove={() => setActive(index)}
              onClick={() => choose(index)}
            >
              <span>{option.label}</span>
              {index === selectedIndex && <Check size={15} aria-hidden="true" />}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
