"use client";

import { useMemo, useState, type FormEvent } from "react";
import { CheckCircle2, LoaderCircle, Mail, MessageSquareText } from "lucide-react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { SITE_COPY, type SiteLocale } from "@/messages/site";

type Topic = "student" | "owner" | "other";

export default function ContactForm({ locale }: { locale: SiteLocale }) {
  const t = SITE_COPY[locale];
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);
  const [name, setName] = useState("");
  const [contact, setContact] = useState("");
  const [topic, setTopic] = useState<Topic>("student");
  const [message, setMessage] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent">("idle");
  const [error, setError] = useState("");

  const topics: Array<{ value: Topic; label: string }> = [
    { value: "student", label: t.contactTopicStudent },
    { value: "owner", label: t.contactTopicOwner },
    { value: "other", label: t.contactTopicOther },
  ];

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (contact.trim().length < 5) {
      setError(t.contactNeedReply);
      return;
    }
    if (message.trim().length < 10) {
      setError(t.contactNeedMessage);
      return;
    }
    if (!supabase) {
      setError(t.contactError);
      return;
    }
    setState("sending");
    setError("");
    // Insert only: visitors can send messages but never read them back.
    const { error: insertError } = await supabase.from("contact_messages").insert({
      name: name.trim() || null,
      contact: contact.trim(),
      topic,
      message: message.trim(),
      locale,
    });
    if (insertError) {
      console.error("Could not send contact message:", insertError);
      setError(t.contactError);
      setState("idle");
      return;
    }
    setState("sent");
  }

  return (
    <section className="contact2 section-wrap" id="contact" aria-labelledby="contact-title">
      <div className="contact2-intro">
        <span className="section-kicker">{t.contactKicker}</span>
        <h2 id="contact-title">{t.contactTitle}</h2>
        <p>{t.contactText}</p>
        <ul>
          <li><MessageSquareText size={18} /> {t.contactPointReply}</li>
          <li><Mail size={18} /> {t.contactPointPrivacy}</li>
        </ul>
      </div>

      <div className="contact2-card">
        {state === "sent" ? (
          <div className="contact2-sent" role="status">
            <CheckCircle2 size={34} />
            <h3>{t.contactSentTitle}</h3>
            <p>{t.contactSentText}</p>
          </div>
        ) : (
          <form className="contact2-form" onSubmit={submit} noValidate>
            <div className="choice-row" role="radiogroup" aria-label={t.contactTopic}>
              {topics.map((item) => (
                <label className="choice" key={item.value}>
                  <input type="radio" name="topic" value={item.value} checked={topic === item.value} onChange={() => setTopic(item.value)} />
                  <span>{item.label}</span>
                </label>
              ))}
            </div>
            <div className="owner-form-grid">
              <label className="owner-field">
                <span>{t.contactName}</span>
                <input name="name" autoComplete="name" maxLength={80} value={name} onChange={(event) => setName(event.target.value)} />
              </label>
              <label className="owner-field">
                <span>{t.contactReply}</span>
                <input name="contact" autoComplete="email" maxLength={120} dir="ltr" placeholder={t.contactReplyPlaceholder} value={contact} onChange={(event) => { setContact(event.target.value); setError(""); }} required />
              </label>
            </div>
            <label className="owner-field">
              <span>{t.contactMessage}</span>
              <textarea name="message" rows={5} maxLength={2000} value={message} onChange={(event) => { setMessage(event.target.value); setError(""); }} required />
            </label>
            {error && <p className="owner-feedback owner-feedback-error" role="alert">{error}</p>}
            <button className="button button-primary contact2-submit" type="submit" disabled={state === "sending"}>
              {state === "sending" && <LoaderCircle className="spinner" size={16} />}
              {state === "sending" ? t.contactSending : t.contactSend}
            </button>
            <p className="contact2-legal">
              {t.contactLegalPrefix} <a href={`/${locale}/privacy`}>{t.privacyLink}</a>.
            </p>
          </form>
        )}
      </div>
    </section>
  );
}
