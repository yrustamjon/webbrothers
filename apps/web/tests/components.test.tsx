import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import App, { Auth, Explorer, Pairing } from "../src/App";
import { useSelection } from "../src/store";
const response = (value: unknown, status = 200) =>
  Promise.resolve(
    new Response(JSON.stringify(value), {
      status,
      headers: { "Content-Type": "application/json" },
    }),
  );
function mount(element: React.ReactNode) {
  return render(
    <QueryClientProvider
      client={
        new QueryClient({
          defaultOptions: {
            queries: { retry: false },
            mutations: { retry: false },
          },
        })
      }
    >
      {element}
    </QueryClientProvider>,
  );
}
const device = {
  id: "d1",
  display_name: "Ish kompyuteri",
  operating_system: "linux",
  architecture: "amd64",
  status: "online",
  scopes: ["browser.discovery", "history.read"],
};
beforeEach(() => {
  useSelection.getState().clear();
  vi.restoreAllMocks();
});
describe("haqiqiy komponent oʻzaro taʼsirlari", () => {
  it("yangi agentda ruxsatsiz Loginlar va Trafik koʻrinadi, lekin soʻrov yubormaydi", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation((url, options) => {
        if (String(url).endsWith("/auth/csrf"))
          return response({ csrf_token: "csrf" });
        const body = JSON.parse(String(options?.body));
        if (body.type === "BROWSER_LIST_REQUEST")
          return response({
            payload: {
              items: [
                {
                  id: "chrome",
                  name: "Chrome",
                  profiles: [{ id: "p1", name: "Shaxsiy" }],
                  capabilities: [
                    "history.read",
                    "login.inventory",
                    "traffic.aggregate",
                  ],
                },
              ],
            },
          });
        return response({ payload: { items: [], page: 1, page_size: 25 } });
      });
    mount(<Explorer device={device} />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: /Chrome/ }));
    await user.click(screen.getByRole("button", { name: "Shaxsiy" }));
    for (const name of ["Loginlar", "Trafik"]) {
      await user.click(screen.getByRole("tab", { name }));
      expect(
        screen.getByText("Bu boʻlimga ruxsat berilmagan"),
      ).toBeInTheDocument();
      expect(screen.getByText(/3 — Ruxsatlarni yangilash/)).toBeInTheDocument();
    }
    expect(
      fetchMock.mock.calls.some(
        ([, opts]) =>
          opts?.body &&
          ["LOGIN_INVENTORY_QUERY", "TRAFFIC_STATS_REQUEST"].includes(
            JSON.parse(String(opts.body)).type,
          ),
      ),
    ).toBe(false);
    expect(screen.queryByText("fixture-user")).not.toBeInTheDocument();
  });
  it.each([false, true])(
    "email metamaʼlumoti yoʻqligi sign-out deb koʻrsatilmaydi (yangi agent: %s)",
    async (modern) => {
      vi.spyOn(globalThis, "fetch").mockImplementation((url) =>
        String(url).endsWith("/auth/csrf")
          ? response({ csrf_token: "csrf" })
          : response({
              payload: {
                items: [
                  {
                    id: "chrome",
                    name: "Chrome",
                    profiles: [
                      { id: "p1", name: "Profile 1" },
                      { id: "p2", name: "Default" },
                    ],
                    ...(modern ? { capabilities: ["history.read"] } : {}),
                  },
                ],
              },
            }),
      );
      mount(<Explorer device={device} />);
      await userEvent.click(
        await screen.findByRole("button", { name: /Chrome/ }),
      );
      for (const name of ["Profile 1", "Default"]) {
        const profile = screen.getByRole("button", { name, exact: true });
        expect(
          within(profile).getByText(
            modern ? "Email aniqlanmadi" : "Email hali olinmagan",
          ),
        ).toBeVisible();
        expect(within(profile).getByText(name)).toBeVisible();
      }
      expect(screen.queryByText("Email ulanmagan")).not.toBeInTheDocument();
      if (modern)
        expect(
          screen.queryByRole("note", { name: "Agentni yangilash" }),
        ).not.toBeInTheDocument();
      else
        expect(
          screen.getByRole("note", { name: "Agentni yangilash" }),
        ).toHaveTextContent(
          "Bu agent profil emailini yubormaydi. Agentni yangilang va qayta ishga tushiring.",
        );
    },
  );
  it("yangi hisob agentdan boshlab kod tasdiqlashgacha ketma-ket yoʻnaltiriladi", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation((url) => {
      if (String(url).endsWith("/auth/me"))
        return response({ email: "fixture@example.test" });
      if (String(url).endsWith("/agent/installers"))
        return response({
          status: "available",
          items: [
            {
              platform: "windows",
              architecture: "amd64",
              version: "1.0.0",
              filename: "bmp-agent-windows-amd64-setup.exe",
              download_url:
                "https://github.com/yrustamjon/webbrothers/releases/download/agent-v1.0.0/bmp-agent-windows-amd64-setup.exe",
              release_url:
                "https://github.com/yrustamjon/webbrothers/releases/tag/agent-v1.0.0",
              sha256: "a".repeat(64),
            },
          ],
        });
      return response({ items: [] });
    });
    mount(<App />);
    await screen.findByText("Hali qurilma ulanmagan");
    const user = userEvent.setup();
    const journey = screen.getByRole("region", {
      name: "Qurilmani ulash bosqichlari",
    });
    expect(
      within(journey).getByRole("button", { name: /1 Agent yuklash/ }),
    ).toHaveAttribute("aria-current", "step");
    await user.click(
      screen.getByRole("button", { name: "Agentni yuklab olish" }),
    );
    const download = await screen.findByRole("link", {
      name: "Windows ilovasini yuklab olish",
    });
    download.addEventListener("click", (event) => event.preventDefault());
    await user.click(download);
    expect(
      within(journey).getByRole("button", { name: /2 Ilovani ochish/ }),
    ).toHaveAttribute("aria-current", "step");
    await user.click(
      screen.getByRole("button", { name: /Kodni tasdiqlashga oʻtish/ }),
    );
    expect(
      screen.getByRole("textbox", { name: "Ulash kodi" }),
    ).toBeInTheDocument();
    expect(
      within(journey).getByRole("button", { name: /3 Kodni tasdiqlash/ }),
    ).toHaveAttribute("aria-current", "step");
    expect(
      screen.getByRole("button", { name: "Ulashni tasdiqlash" }),
    ).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Qurilma ulash", exact: true }),
    ).toHaveAttribute("aria-current", "page");
  });

  it("qurilma roʻyxati va profil ish maydoni alohida ekranlarda ochiladi", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation((url) =>
      String(url).endsWith("/auth/me")
        ? response({ email: "fixture@example.test" })
        : String(url).endsWith("/devices")
          ? response({ items: [{ ...device, operating_system: "darwin" }] })
          : String(url).endsWith("/auth/csrf")
            ? response({ csrf_token: "csrf" })
            : response({ payload: { items: [] } }),
    );
    mount(<App />);
    await screen.findByText("Ish kompyuteri");
    expect(
      screen.queryByRole("region", { name: "Qurilmani ulash bosqichlari" }),
    ).not.toBeInTheDocument();
    expect(screen.getByText("Jami qurilmalar")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Profil va maʼlumotlar/ }),
    ).toBeEnabled();
    expect(
      screen.queryByText("Hali qurilma ulanmagan"),
    ).not.toBeInTheDocument();
    const user = userEvent.setup();
    await user.click(
      screen.getByRole("button", { name: /Profil va maʼlumotlar/ }),
    );
    await screen.findByText("Qoʻllab-quvvatlanadigan brauzer topilmadi.");
    expect(
      screen.getByRole("heading", { name: "Qurilma profillari" }),
    ).toBeInTheDocument();
    expect(screen.getByText(/macOS · amd64/)).toBeInTheDocument();
    expect(screen.queryByText("Jami qurilmalar")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "Kompyuterlaringiz" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("region", { name: "Qurilmani ulash bosqichlari" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Qurilmalar", exact: true }),
    ).toHaveAttribute("aria-current", "page");
    await user.click(
      screen.getByRole("button", { name: /Qurilmalarga qaytish/ }),
    );
    expect(
      screen.getByRole("heading", { name: "Kompyuterlaringiz" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("navigation", { name: "Brauzer va profillar" }),
    ).not.toBeInTheDocument();
  });
  it("profil nomi yoki email qidiruvi faqat mos profillarni koʻrsatib toʻgʻri profilni ochadi", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation((url, options) => {
        if (String(url).endsWith("/auth/csrf"))
          return response({ csrf_token: "csrf" });
        const body = JSON.parse(String(options?.body));
        if (body.type === "BROWSER_LIST_REQUEST")
          return response({
            payload: {
              items: [
                {
                  id: "chrome",
                  name: "Chrome",
                  capabilities: ["history.read"],
                  profiles: [
                    { id: "personal", name: "Shaxsiy · alice@example.test" },
                    { id: "work", name: "Jamoa · team@example.test" },
                    { id: "unsigned", name: "Profile 50" },
                  ],
                },
                {
                  id: "firefox",
                  name: "Firefox",
                  profiles: [{ id: "other", name: "Boshqa" }],
                },
              ],
            },
          });
        return response({ payload: { items: [], page: 1, page_size: 25 } });
      });
    mount(<Explorer device={device} />);
    await screen.findByRole("button", { name: /Chrome/ });
    const user = userEvent.setup();
    const search = screen.getByRole("searchbox", {
      name: "Brauzer, profil yoki email",
    });
    await user.type(search, "TEAM@example.test");
    expect(screen.getByRole("button", { name: /Chrome/ })).toHaveAttribute(
      "aria-expanded",
      "false",
    );
    await user.click(screen.getByRole("button", { name: /Chrome/ }));
    expect(
      screen.getByRole("button", { name: "Jamoa · team@example.test" }),
    ).toBeInTheDocument();
    expect(
      within(
        screen.getByRole("button", { name: "Jamoa · team@example.test" }),
      ).getByText("team@example.test"),
    ).toBeVisible();
    expect(
      screen.queryByRole("button", { name: /alice@example.test/ }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Firefox/ }),
    ).not.toBeInTheDocument();
    await user.click(
      screen.getByRole("button", { name: "Jamoa · team@example.test" }),
    );
    await screen.findByText("Tanlangan filtrlarda tarix topilmadi.");
    expect(
      fetchMock.mock.calls.some(([, options]) => {
        if (!options?.body) return false;
        const body = JSON.parse(String(options.body));
        return (
          body.type === "HISTORY_QUERY" &&
          body.params.browser_id === "chrome" &&
          body.params.profile_id === "work"
        );
      }),
    ).toBe(true);
    await user.clear(search);
    await user.type(search, "shaxsiy");
    expect(
      screen.getByRole("button", { name: "Shaxsiy · alice@example.test" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Jamoa · team@example.test" }),
    ).not.toBeInTheDocument();
    await user.clear(search);
    expect(
      within(screen.getByRole("button", { name: "Profile 50" })).getByText(
        "Email aniqlanmadi",
      ),
    ).toBeVisible();
    await user.type(search, "topilmaydi");
    expect(screen.getByRole("status")).toHaveTextContent(
      "Mos brauzer yoki profil topilmadi.",
    );
  });

  it("uzun tarix URL soʻrovi yopiq tafsilotda qoladi va xavfsiz asl havola saqlanadi", async () => {
    const longURL = `https://example.test/articles/fixture?fixture_token=${"synthetic".repeat(300)}#fixture-fragment`;
    vi.spyOn(globalThis, "fetch").mockImplementation((url, options) => {
      if (String(url).endsWith("/auth/csrf"))
        return response({ csrf_token: "csrf" });
      const body = JSON.parse(String(options?.body));
      if (body.type === "BROWSER_LIST_REQUEST")
        return response({
          payload: {
            items: [
              {
                id: "chrome",
                name: "Chrome",
                profiles: [{ id: "p1", name: "Shaxsiy" }],
              },
            ],
          },
        });
      return response({
        payload: {
          items: [
            {
              url: longURL,
              title: "Fixture article",
              domain: "example.test",
              visited_at: "2026-11-02T10:00:00Z",
              visit_count: 1,
            },
            {
              url: "javascript:alert('synthetic')",
              title: "Unsafe fixture",
              domain: "",
              visited_at: "2026-11-02T10:00:00Z",
              visit_count: 1,
            },
          ],
          page: 1,
          page_size: 25,
        },
      });
    });
    mount(<Explorer device={device} />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: /Chrome/ }));
    await user.click(screen.getByRole("button", { name: "Shaxsiy" }));
    expect(
      await screen.findByRole("link", { name: "Fixture article" }),
    ).toHaveAttribute("href", longURL);
    expect(screen.getByText("example.test/articles/fixture")).toBeVisible();
    const fullURL = screen.getByText(longURL);
    expect(fullURL).not.toBeVisible();
    expect(
      screen.queryByRole("link", { name: "Unsafe fixture" }),
    ).not.toBeInTheDocument();
    await user.click(screen.getAllByText("Toʻliq manzil")[0]);
    expect(fullURL).toBeVisible();
    await user.click(screen.getAllByText("Toʻliq manzil")[0]);
    expect(fullURL).not.toBeVisible();
  });

  it("yangi Mac agent imkoniyatlari va rozilik bilan loginlar hamda trafikni ochadi", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation((url, options) => {
        if (String(url).endsWith("/auth/csrf"))
          return response({ csrf_token: "csrf" });
        const body = JSON.parse(String(options?.body));
        if (body.type === "BROWSER_LIST_REQUEST")
          return response({
            payload: {
              items: [
                {
                  id: "chrome",
                  name: "Chrome",
                  profiles: [{ id: "p1", name: "Shaxsiy" }],
                  capabilities: [
                    "history.read",
                    "login.inventory",
                    "traffic.aggregate",
                  ],
                },
              ],
            },
          });
        if (body.type === "LOGIN_INVENTORY_QUERY")
          return response({
            payload: {
              items: [
                {
                  domain: "fixture.test",
                  username: "fixture-user",
                  credential_exists: true,
                },
              ],
            },
          });
        if (body.type === "TRAFFIC_STATS_REQUEST")
          return response({
            payload: {
              received_bytes: 123,
              sent_bytes: 456,
              attribution: "device",
              collected_at: "2026-11-02T10:00:00Z",
            },
          });
        return response({ payload: { items: [], page: 1, page_size: 25 } });
      });
    mount(
      <Explorer
        device={{
          ...device,
          operating_system: "darwin",
          scopes: [...device.scopes, "login.inventory", "traffic.aggregate"],
        }}
      />,
    );
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: /Chrome/ }));
    await user.click(screen.getByRole("button", { name: "Shaxsiy" }));
    await user.click(screen.getByRole("tab", { name: "Loginlar" }));
    expect(await screen.findByText("fixture-user")).toBeInTheDocument();
    expect(screen.getByText("fixture.test")).toBeInTheDocument();
    await user.click(screen.getByRole("tab", { name: "Trafik" }));
    expect(await screen.findByText("Qabul qilingan")).toBeInTheDocument();
    expect(
      fetchMock.mock.calls.some(
        ([, opts]) =>
          opts?.body &&
          JSON.parse(String(opts.body)).type === "TRAFFIC_STATS_REQUEST",
      ),
    ).toBe(true);
  });
  it("kirish autentifikatsiyasiz CSRF chaqirmaydi va parolni yuboradi", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(() => response({ email: "user@example.com" }));
    const done = vi.fn();
    mount(<Auth onLogin={done} />);
    const user = userEvent.setup();
    await user.type(
      screen.getByLabelText("Elektron pochta"),
      "user@example.com",
    );
    await user.type(screen.getByLabelText("Parol"), "very-long-password");
    await user.click(
      screen.getByRole("button", { name: "Kirish", exact: true }),
    );
    await waitFor(() => expect(done).toHaveBeenCalledOnce());
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe("/api/v1/auth/login");
    expect(JSON.parse(fetchMock.mock.calls[0][1]?.body as string)).toEqual({
      email: "user@example.com",
      password: "very-long-password",
    });
  });
  it("kirish xatosi oʻzbekcha koʻrsatiladi", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(() =>
      response({ detail: "Parol notoʻgʻri." }, 401),
    );
    mount(<Auth onLogin={vi.fn()} />);
    const user = userEvent.setup();
    await user.type(
      screen.getByLabelText("Elektron pochta"),
      "user@example.com",
    );
    await user.type(screen.getByLabelText("Parol"), "very-long-password");
    await user.click(
      screen.getByRole("button", { name: "Kirish", exact: true }),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Parol notoʻgʻri.",
    );
  });
  it("faqat bitta brauzer ochiladi, profil va tarix filtrlari agentga yuboriladi", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation((url, options) => {
        if (String(url).endsWith("/auth/csrf"))
          return response({ csrf_token: "csrf" });
        const body = JSON.parse(options?.body as string);
        if (body.type === "BROWSER_LIST_REQUEST")
          return response({
            payload: {
              items: [
                {
                  id: "chrome",
                  name: "Chrome",
                  profiles: [{ id: "p1", name: "Shaxsiy" }],
                },
                {
                  id: "firefox",
                  name: "Firefox",
                  profiles: [{ id: "p2", name: "Ish" }],
                },
              ],
            },
          });
        return response({
          payload: { items: [], page: 1, page_size: 25, total: 0 },
        });
      });
    mount(
      <Explorer
        device={{
          ...device,
          operating_system: "darwin",
          scopes: [...device.scopes, "traffic.aggregate", "login.inventory"],
        }}
      />,
    );
    const user = userEvent.setup();
    const chrome = await screen.findByRole("button", { name: /Chrome/ });
    await user.click(chrome);
    expect(chrome).toHaveAttribute("aria-expanded", "true");
    await user.click(screen.getByRole("button", { name: /Firefox/ }));
    expect(chrome).toHaveAttribute("aria-expanded", "false");
    expect(
      screen.queryByRole("button", { name: "Shaxsiy" }),
    ).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Ish", exact: true }));
    await screen.findByText("Tanlangan filtrlarda tarix topilmadi.");
    expect(screen.getByRole("tab", { name: "Loginlar" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Trafik" })).toBeInTheDocument();
    await user.click(screen.getByRole("tab", { name: "Loginlar" }));
    expect(
      screen.getByText("Loginlar uchun brauzer parol menejeridan foydalaning"),
    ).toBeInTheDocument();
    expect(screen.getByText("about:logins")).toBeInTheDocument();
    await user.click(screen.getByRole("tab", { name: "Trafik" }));
    expect(
      screen.getByText("Bu boʻlim uchun agentni yangilang"),
    ).toBeInTheDocument();
    expect(
      fetchMock.mock.calls.some(
        ([, opts]) =>
          opts?.body &&
          ["LOGIN_INVENTORY_QUERY", "TRAFFIC_STATS_REQUEST"].includes(
            JSON.parse(String(opts.body)).type,
          ),
      ),
    ).toBe(false);
    await user.click(screen.getByRole("tab", { name: "Tarix" }));
    await user.type(
      screen.getByLabelText("URL, sarlavha yoki domen"),
      "example",
    );
    await user.click(
      screen.getByRole("button", { name: "Qidirish", exact: true }),
    );
    await waitFor(() =>
      expect(
        fetchMock.mock.calls.some(([, opts]) => {
          if (!opts?.body) return false;
          const b = JSON.parse(String(opts.body));
          return (
            b.type === "HISTORY_QUERY" &&
            b.params.profile_id === "p2" &&
            b.params.search === "example"
          );
        }),
      ).toBe(true),
    );
  });
  it("ulash faqat aniq tanlangan ruxsatlarni yuboradi", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation((url) =>
        String(url).endsWith("/auth/csrf")
          ? response({ csrf_token: "csrf" })
          : response({ status: "approved" }),
      );
    const done = vi.fn();
    mount(<Pairing onDone={done} />);
    const user = userEvent.setup();
    const approve = screen.getByRole("button", { name: "Ulashni tasdiqlash" });
    expect(approve).toBeDisabled();
    await user.type(screen.getByLabelText("Ulash kodi"), "AABBCCDDEEFF");
    await user.click(
      screen.getByRole("checkbox", { name: "Brauzerlarni aniqlash" }),
    );
    await user.click(approve);
    await waitFor(() => expect(done).toHaveBeenCalledOnce());
    const call = fetchMock.mock.calls.find(([url]) =>
      String(url).endsWith("/pairing/approve"),
    );
    expect(JSON.parse(String(call?.[1]?.body))).toEqual({
      code: "AABBCCDDEEFF",
      scopes: ["browser.discovery"],
    });
    expect(call?.[1]?.headers).toMatchObject({ "X-CSRF-Token": "csrf" });
  });
  it("pauzadagi online qurilma agentga soʻrov yubormaydi", () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    mount(<Explorer device={{ ...device, monitoring_paused: true }} />);
    expect(screen.getByRole("status")).toHaveTextContent(
      "Kuzatuv toʻxtatilgan",
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("offline qurilma agentga soʻrov yubormaydi", () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    mount(<Explorer device={{ ...device, status: "offline" }} />);
    expect(screen.getByRole("status")).toHaveTextContent("Qurilma ulanmagan");
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("agent ruxsat xatosi interfeysda yashirilmaydi", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation((url) =>
      String(url).endsWith("/auth/csrf")
        ? response({ csrf_token: "csrf" })
        : response({ detail: "Ruxsat berilmagan." }, 403),
    );
    mount(<Explorer device={device} />);
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Ruxsat berilmagan.",
    );
  });
});
