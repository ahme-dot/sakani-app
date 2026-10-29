"use client";

import { useEffect, useMemo, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { BadgeCheck, LoaderCircle, Mail, Search, ShieldCheck, UserRound, UsersRound } from "lucide-react";
import { SITE_COPY, type SiteLocale } from "@/messages/site";

export type DirectoryUser = {
  user_id: string;
  email: string;
  full_name: string;
  is_guest: boolean;
  is_admin: boolean;
  joined_at: string;
  last_sign_in_at: string | null;
  listings_total: number;
  listings_pending: number;
  listings_approved: number;
  listings_rejected: number;
};

export default function AdminUsers({
  locale,
  users,
  loading,
  error,
  onViewListings,
  supabase,
}: {
  locale: SiteLocale;
  supabase: SupabaseClient | null;
  users: DirectoryUser[];
  loading: boolean;
  error: string;
  onViewListings: (user: DirectoryUser) => void;
}) {
  const t = SITE_COPY[locale];
  const [search, setSearch] = useState("");
  const [type, setType] = useState<"all" | "account" | "guest">("all");
  const dateFormat = new Intl.DateTimeFormat(locale === "ar" ? "ar-EG-u-nu-latn" : "en-EG", { dateStyle: "medium" });
  const numberFormat = new Intl.NumberFormat(locale === "ar" ? "ar-EG-u-nu-latn" : "en-EG");
  const [profiles, setProfiles] = useState<Record<string, { role: "host" | "guest"; id_verified: boolean }>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const accountIds = users.filter((user) => !user.is_guest).map((user) => user.user_id).join(",");

  // Host or guest, and whether the team checked their identity.
  useEffect(() => {
    if (!supabase || !accountIds) return;
    let active = true;
    void supabase.from("profiles").select("id,role,id_verified").in("id", accountIds.split(",")).then(({ data }) => {
      if (active) setProfiles(Object.fromEntries(((data ?? []) as Array<{ id: string; role: "host" | "guest"; id_verified: boolean }>).map((row) => [row.id, row])));
    });
    return () => {
      active = false;
    };
  }, [supabase, accountIds]);

  async function toggleVerified(userId: string) {
    if (!supabase) return;
    const next = !profiles[userId]?.id_verified;
    setBusyId(userId);
    const { error: verifyError } = await supabase.from("profiles").update({ id_verified: next }).eq("id", userId);
    setBusyId(null);
    if (verifyError) {
      console.error("Could not update identity check:", verifyError);
      return;
    }
    setProfiles((current) => ({ ...current, [userId]: { ...current[userId], id_verified: next } }));
  }

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    return users.filter((user) =>
      (type === "all" || (type === "guest") === user.is_guest) &&
      (!term || user.email.toLowerCase().includes(term) || user.full_name.toLowerCase().includes(term)),
    );
  }, [users, search, type]);

  const accounts = users.filter((user) => !user.is_guest).length;
  const guests = users.length - accounts;
  const filters: Array<{ value: typeof type; label: string; count: number }> = [
    { value: "all", label: t.usersFilterAll, count: users.length },
    { value: "account", label: t.userTypeAccount, count: accounts },
    { value: "guest", label: t.userTypeGuest, count: guests },
  ];

  return (
    <section className="admin-users" aria-label={t.adminViewUsers}>
      <div className="admin-users-toolbar">
        <div className="admin-segment" role="tablist" aria-label={t.adminViewUsers}>
          {filters.map((filter) => (
            <button key={filter.value} type="button" role="tab" aria-selected={type === filter.value} className={type === filter.value ? "is-active" : ""} onClick={() => setType(filter.value)}>
              {filter.label} <span>{numberFormat.format(filter.count)}</span>
            </button>
          ))}
        </div>
        <label className="admin-search">
          <Search size={16} aria-hidden="true" />
          <input type="search" value={search} aria-label={t.usersSearch} placeholder={t.usersSearch} onChange={(event) => setSearch(event.target.value)} />
        </label>
      </div>

      {error && <p className="owner-feedback owner-feedback-error admin-feedback" role="alert">{error}</p>}

      {loading ? (
        <div className="portal-loading"><LoaderCircle className="spinner" size={22} />{t.loading}</div>
      ) : visible.length === 0 ? (
        <section className="admin-empty-state"><UsersRound size={26} /><p>{t.usersEmpty}</p></section>
      ) : (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th scope="col">{t.usersColUser}</th>
                <th scope="col">{t.usersColType}</th>
                <th scope="col">{t.usersColJoined}</th>
                <th scope="col">{t.usersColLastSeen}</th>
                <th scope="col">{t.usersColListings}</th>
                <th scope="col"><span className="visually-hidden">{t.usersViewListings}</span></th>
              </tr>
            </thead>
            <tbody>
              {visible.map((user) => (
                <tr key={user.user_id}>
                  <td>
                    <div className="admin-user-cell">
                      <span className={`admin-avatar${user.is_guest ? " is-guest" : ""}`} aria-hidden="true">
                        {user.is_guest ? <UserRound size={15} /> : (user.full_name || user.email)[0]?.toUpperCase()}
                      </span>
                      <span>
                        <strong>{user.is_guest ? t.ownerGuest : user.full_name || t.noName}</strong>
                        {user.email && <a href={`mailto:${user.email}`} dir="ltr"><Mail size={12} /> {user.email}</a>}
                      </span>
                    </div>
                  </td>
                  <td>
                    <span className={`user-type user-type-${user.is_admin ? "admin" : user.is_guest ? "guest" : "account"}`}>
                      {user.is_admin && <ShieldCheck size={12} />}
                      {user.is_admin ? t.userTypeAdmin : user.is_guest ? t.userTypeGuest : t.userTypeAccount}
                    </span>
                    {profiles[user.user_id] && (
                      <span className={`role-chip is-${profiles[user.user_id].role}`}>{profiles[user.user_id].role === "host" ? t.roleHost : t.roleGuest}</span>
                    )}
                  </td>
                  <td>{dateFormat.format(new Date(user.joined_at))}</td>
                  <td>{user.last_sign_in_at ? dateFormat.format(new Date(user.last_sign_in_at)) : "–"}</td>
                  <td>
                    <div className="listing-count-chips">
                      {user.listings_total === 0 ? <span className="is-zero">0</span> : (
                        <>
                          {user.listings_pending > 0 && <span className="is-pending" title={t.adminPending}>{numberFormat.format(user.listings_pending)} {t.adminPending}</span>}
                          {user.listings_approved > 0 && <span className="is-approved" title={t.adminApproved}>{numberFormat.format(user.listings_approved)} {t.adminApproved}</span>}
                          {user.listings_rejected > 0 && <span className="is-rejected" title={t.adminRejected}>{numberFormat.format(user.listings_rejected)} {t.adminRejected}</span>}
                        </>
                      )}
                    </div>
                  </td>
                  <td>
                    <div className="admin-card-actions">
                      {profiles[user.user_id] && (
                        <button
                          className={`admin-btn ${profiles[user.user_id].id_verified ? "admin-btn-primary" : "admin-btn-ghost"}`}
                          type="button"
                          disabled={busyId === user.user_id}
                          aria-pressed={profiles[user.user_id].id_verified}
                          onClick={() => void toggleVerified(user.user_id)}
                        >
                          <BadgeCheck size={14} /> {profiles[user.user_id].id_verified ? t.idVerified : t.verifyIdButton}
                        </button>
                      )}
                      {user.listings_total > 0 && (
                        <button className="admin-btn admin-btn-ghost" type="button" onClick={() => onViewListings(user)}>{t.usersViewListings}</button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
