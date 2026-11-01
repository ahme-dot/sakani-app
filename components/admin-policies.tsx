"use client";

import { useEffect, useState, type FormEvent } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { LoaderCircle, Save } from "lucide-react";
import { CANCELLATION_SCENARIOS } from "@/components/admin-requests";
import { SITE_COPY, type SiteLocale } from "@/messages/site";

type Rule = { scenario: string; refund_rent_percent: number | null; refund_guest_fee: boolean | null; refund_deposit: boolean | null; notes: string };
type Settings = { payment_mode: "manual" | "sandbox"; cancellation_policy_active: boolean; cancellation_policy_note: string };
type RateChange = { id: number; at: string; old_data: Record<string, unknown> | null; new_data: Record<string, unknown> | null };

/** Admin: the cancellation rules (one per scenario), the policy switch, the payment mode, and the history of fee rate changes. */
export default function AdminPolicies({ locale, supabase }: { locale: SiteLocale; supabase: SupabaseClient }) {
  const t = SITE_COPY[locale];
  const timeFormat = new Intl.DateTimeFormat(locale === "ar" ? "ar-EG-u-nu-latn" : "en-EG", { dateStyle: "medium", timeStyle: "short" });
  const [rules, setRules] = useState<Rule[] | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [changes, setChanges] = useState<RateChange[]>([]);
  const [version, setVersion] = useState(0);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    void Promise.all([
      supabase.from("cancellation_rules").select("scenario,refund_rent_percent,refund_guest_fee,refund_deposit,notes"),
      supabase.from("app_settings").select("payment_mode,cancellation_policy_active,cancellation_policy_note").eq("id", 1).maybeSingle(),
      supabase.from("audit_logs").select("id,at,old_data,new_data").eq("entity", "app_settings").order("at", { ascending: false }).limit(30),
    ]).then(([ruleRows, settingsRow, log]) => {
      if (!active) return;
      if (ruleRows.error || settingsRow.error) {
        console.error("Could not load policies:", ruleRows.error ?? settingsRow.error);
        setError(t.policiesLoadError);
        return;
      }
      const byScenario = new Map(((ruleRows.data ?? []) as Rule[]).map((rule) => [rule.scenario, rule]));
      setRules(CANCELLATION_SCENARIOS.map((scenario) => byScenario.get(scenario) ?? { scenario, refund_rent_percent: null, refund_guest_fee: null, refund_deposit: null, notes: "" }));
      setSettings(settingsRow.data as Settings);
      // Only the entries where a fee rate changed.
      setChanges(((log.data ?? []) as RateChange[]).filter((entry) =>
        ["fee_percent", "student_fee_percent"].some((key) => String(entry.old_data?.[key]) !== String(entry.new_data?.[key]))));
    });
    return () => {
      active = false;
    };
  }, [supabase, version, t]);

  async function save(action: () => PromiseLike<{ error: unknown }>) {
    setBusy(true);
    setError("");
    setMessage("");
    const { error: saveError } = await action();
    setBusy(false);
    if (saveError) {
      console.error("Could not save policies:", saveError);
      setError(t.adminUpdateError);
      return;
    }
    setMessage(t.settingsSaved);
    setVersion((value) => value + 1);
  }

  function saveSettings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    void save(() => supabase.from("app_settings").update({
      payment_mode: String(form.get("payment_mode")) === "sandbox" ? "sandbox" : "manual",
      cancellation_policy_active: form.has("cancellation_policy_active"),
      cancellation_policy_note: String(form.get("cancellation_policy_note") ?? "").trim().slice(0, 500),
    }).eq("id", 1));
  }

  function saveRule(event: FormEvent<HTMLFormElement>, scenario: string) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const choice = (name: string) => (form.get(name) === "yes" ? true : form.get(name) === "no" ? false : null);
    const percent = String(form.get("refund_rent_percent") ?? "").trim();
    void save(() => supabase.from("cancellation_rules").update({
      refund_rent_percent: percent === "" ? null : Math.min(100, Math.max(0, Math.round(Number(percent)))),
      refund_guest_fee: choice("refund_guest_fee"),
      refund_deposit: choice("refund_deposit"),
      notes: String(form.get("notes") ?? "").trim().slice(0, 500),
      updated_at: new Date().toISOString(),
    }).eq("scenario", scenario));
  }

  if (error && !rules) return <p className="owner-feedback owner-feedback-error">{error}</p>;
  if (!rules || !settings) return <div className="portal-loading"><LoaderCircle className="spinner" size={22} />{t.loading}</div>;

  const yesNo = (value: boolean | null) => (value === true ? "yes" : value === false ? "no" : "");

  return (
    <section className="admin-policies">
      {message && <p className="owner-feedback owner-feedback-success admin-feedback" role="status">{message}</p>}
      {error && <p className="owner-feedback owner-feedback-error admin-feedback" role="alert">{error}</p>}

      <form className="admin-pay-settings" onSubmit={saveSettings}>
        <h2>{t.policySwitchTitle}</h2>
        <p className="field-hint">{t.policySwitchHint}</p>
        <label className="choice">
          <input type="checkbox" name="cancellation_policy_active" defaultChecked={settings.cancellation_policy_active} />
          <span>{t.policyActiveLabel}</span>
        </label>
        <label className="owner-field"><span>{t.policyNoteLabel}</span><input name="cancellation_policy_note" defaultValue={settings.cancellation_policy_note} maxLength={500} placeholder={t.policyNotePlaceholder} /></label>
        <label className="owner-field">
          <span>{t.paymentModeLabel}</span>
          <select name="payment_mode" defaultValue={settings.payment_mode}>
            <option value="manual">{t.paymentModeManual}</option>
            <option value="sandbox">{t.paymentModeSandbox}</option>
          </select>
          <small className="field-hint">{t.paymentModeHint}</small>
        </label>
        <button className="admin-btn admin-btn-primary" type="submit" disabled={busy}><Save size={15} /> {t.settingsSave}</button>
      </form>

      <h2>{t.rulesTitle}</h2>
      <p className="field-hint">{t.rulesHint}</p>
      <div className="admin-rules">
        {rules.map((rule) => (
          <form key={rule.scenario} className="admin-rule" onSubmit={(event) => saveRule(event, rule.scenario)}>
            <strong>{t.cancelScenarios[rule.scenario as keyof typeof t.cancelScenarios]}</strong>
            <label className="owner-field"><span>{t.ruleRentPercent}</span><input name="refund_rent_percent" type="number" min="0" max="100" defaultValue={rule.refund_rent_percent ?? ""} placeholder={t.ruleNotDecided} dir="ltr" /></label>
            <label className="owner-field">
              <span>{t.ruleGuestFee}</span>
              <select name="refund_guest_fee" defaultValue={yesNo(rule.refund_guest_fee)}>
                <option value="">{t.ruleNotDecided}</option>
                <option value="yes">{t.ruleYes}</option>
                <option value="no">{t.ruleNo}</option>
              </select>
            </label>
            <label className="owner-field">
              <span>{t.ruleDeposit}</span>
              <select name="refund_deposit" defaultValue={yesNo(rule.refund_deposit)}>
                <option value="">{t.ruleNotDecided}</option>
                <option value="yes">{t.ruleYes}</option>
                <option value="no">{t.ruleNo}</option>
              </select>
            </label>
            <label className="owner-field"><span>{t.ruleNotes}</span><input name="notes" defaultValue={rule.notes} maxLength={500} /></label>
            <button className="admin-btn admin-btn-ghost" type="submit" disabled={busy}><Save size={15} /> {t.settingsSave}</button>
          </form>
        ))}
      </div>

      <h2>{t.rateLogTitle}</h2>
      {changes.length === 0 ? (
        <p className="profile-empty">{t.rateLogEmpty}</p>
      ) : (
        <ul className="profile-list">
          {changes.map((entry) => (
            <li key={entry.id}>
              <div>
                <strong>{t.rateLogLine(String(entry.old_data?.student_fee_percent ?? "—"), String(entry.new_data?.student_fee_percent ?? "—"), String(entry.old_data?.fee_percent ?? "—"), String(entry.new_data?.fee_percent ?? "—"))}</strong>
                <small>{timeFormat.format(new Date(entry.at))}</small>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
