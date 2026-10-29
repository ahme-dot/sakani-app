import { expect, test } from "@playwright/test";
import { ADMIN_EMAIL, ADMIN_PASSWORD, adminToken, api, guestSession, hasAdmin, watchErrors } from "./helpers";

// Every user talks only with the Sakani team. The admin account plays the user and then answers as the team.
test.describe("chat with the Sakani team", () => {
  test.skip(!hasAdmin, "needs admin login");

  test.afterAll(async () => {
    const admin = await adminToken();
    await api("/rest/v1/support_messages?body=like.*E2E*", { token: admin, method: "DELETE" });
  });

  test("only the thread's owner and the team can read or write it", async () => {
    const admin = await adminToken();
    const thread = await api<string>("/rest/v1/rpc/my_support_thread", { token: admin, method: "POST", body: {} });
    test.skip(thread.status >= 400, "chat migration not installed yet");
    const threadId = thread.data;
    const { data: me } = await api<{ id: string }>("/auth/v1/user", { token: admin });

    const sent = await api("/rest/v1/support_messages?select=id", { token: admin, method: "POST", body: { thread_id: threadId, sender_id: me.id, from_team: false, body: "[E2E] hello team" } });
    expect(sent.status).toBeLessThan(300);

    // An anonymous session has no chat, can't read this one, and can't write into it.
    const stranger = await guestSession();
    expect((await api("/rest/v1/rpc/my_support_thread", { token: stranger.access_token, method: "POST", body: {} })).status).toBeGreaterThanOrEqual(400);
    const read = await api<unknown[]>(`/rest/v1/support_messages?select=id&thread_id=eq.${threadId}`, { token: stranger.access_token });
    expect(read.status >= 400 || (read.data as unknown[]).length === 0).toBeTruthy();
    const write = await api("/rest/v1/support_messages", { token: stranger.access_token, method: "POST", body: { thread_id: threadId, sender_id: stranger.user.id, from_team: false, body: "[E2E] intruder" } });
    expect(write.status).toBeGreaterThanOrEqual(400);
    const pose = await api("/rest/v1/support_messages", { token: stranger.access_token, method: "POST", body: { thread_id: threadId, sender_id: stranger.user.id, from_team: true, body: "[E2E] fake team" } });
    expect(pose.status).toBeGreaterThanOrEqual(400);
  });

  test("a user messages the team, the team replies in the admin panel, the user sees the reply", async ({ page }) => {
    const errors = watchErrors(page);
    await page.goto("/en/account?next=%2Fen%2Fmessages");
    await page.fill('input[name="email"]', ADMIN_EMAIL);
    await page.fill('input[name="password"]', ADMIN_PASSWORD);
    await page.locator(".auth-submit").click();
    await expect(page).toHaveURL(/\/en\/messages$/);

    const box = page.locator(".chat-input textarea");
    await expect(box).toBeVisible();
    const stamp = Date.now();
    await box.fill(`[E2E] question ${stamp}`);
    await page.locator(".chat-send").click();
    await expect(page.locator(".chat-message.is-mine", { hasText: `question ${stamp}` })).toBeVisible();

    // The team answers from the admin panel.
    await page.goto("/en/admin");
    await page.locator(".admin-nav button", { hasText: "Chat" }).click();
    await page.locator(".admin-chat-thread").first().click();
    await expect(page.locator(".chat-message", { hasText: `question ${stamp}` })).toBeVisible();
    await page.locator(".chat-input textarea").fill(`[E2E] answer ${stamp}`);
    await page.locator(".chat-send").click();
    await expect(page.locator(".chat-message.is-mine", { hasText: `answer ${stamp}` })).toBeVisible();

    // Back as the user: the reply is there, from the Sakani team.
    await page.goto("/en/messages");
    const reply = page.locator(".chat-message.is-team", { hasText: `answer ${stamp}` });
    await expect(reply).toBeVisible();
    await expect(reply.locator(".chat-author")).toContainText("Sakani team");
    expect(errors).toEqual([]);
  });
});
