import { it, expect, vi, afterEach } from "vitest";
import { render, screen, waitFor, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import Downloads from "../src/Downloads";
import DeviceSettings from "../src/DeviceSettings";
const response = (value: unknown, status = 200) =>
  Promise.resolve(new Response(JSON.stringify(value), { status }));
const device = {
  id: "d1",
  display_name: "Kompyuter",
  operating_system: "linux",
  architecture: "amd64",
  status: "online",
  scopes: ["browser.discovery"],
  enrolled_scopes: ["browser.discovery", "history.read"],
  monitoring_paused: false,
};
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
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
it("mavjud boʻlmagan nashr uchun soxta yuklash tugmasi yoʻq", async () => {
  vi.spyOn(globalThis, "fetch").mockImplementation(() =>
    response({ items: [] }),
  );
  mount(<Downloads />);
  expect(
    await screen.findByText(
      /Tanlangan tizim uchun imzolangan agent paketi hali mavjud emas/,
    ),
  ).toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: "Tekshirilgan agentni yuklab olish" }),
  ).not.toBeInTheDocument();
  await userEvent.selectOptions(
    screen.getByLabelText("Operatsion tizim"),
    "windows",
  );
  expect(
    screen.getByText(/Windows Service integratsiyasi hali mavjud emas/),
  ).toBeInTheDocument();
});
it("haqiqiy nashr tanlanadi va yuklash xatosi yashirilmaydi", async () => {
  const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation((url) =>
    String(url).endsWith("/agent/releases")
      ? response({
          items: [
            {
              platform: "linux",
              architecture: "amd64",
              filename: "bmp-agent-linux-amd64",
              sha256: "a".repeat(64),
              signature: "imzo",
              download_url: "/api/v1/agent/download/linux/amd64",
            },
          ],
        })
      : String(url).endsWith("/agent/installers")
        ? response({ items: [], status: "unavailable" })
        : response({ detail: "Imzolangan agent paketi mavjud emas" }, 404),
  );
  mount(<Downloads />);
  await userEvent.click(
    await screen.findByRole("button", {
      name: "Tekshirilgan agentni yuklab olish",
    }),
  );
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Imzolangan agent paketi mavjud emas",
  );
  expect(fetchMock.mock.calls.at(-1)?.[0]).toBe(
    "/api/v1/agent/download/linux/amd64",
  );
});

const installer = {
  platform: "windows",
  architecture: "amd64",
  filename: "bmp-agent-windows-amd64-setup.exe",
  version: "1.2.3",
  download_url:
    "https://github.com/yrustamjon/webbrothers/releases/download/agent-v1.2.3/bmp-agent-windows-amd64-setup.exe",
  release_url:
    "https://github.com/yrustamjon/webbrothers/releases/tag/agent-v1.2.3",
  sha256: "a".repeat(64),
};

it("oxirgi installer havolasi koʻrsatiladi, tanlangan OSga mos boʻlmagan havola yoʻq", async () => {
  const fetchMock = vi
    .spyOn(globalThis, "fetch")
    .mockImplementation((url) =>
      response(
        String(url).endsWith("/agent/installers")
          ? { items: [installer], status: "available" }
          : { items: [] },
      ),
    );
  mount(<Downloads />);
  expect(
    await screen.findByRole("link", { name: "Windows ilovasini yuklab olish" }),
  ).toHaveAttribute("href", installer.download_url);
  expect(screen.getByText("Oxirgi versiya: 1.2.3")).toBeInTheDocument();
  expect(fetchMock).toHaveBeenCalledWith(
    "/api/v1/agent/installers",
    expect.objectContaining({ credentials: "include", cache: "no-store" }),
  );
  await userEvent.selectOptions(
    screen.getByLabelText("Ilova uchun operatsion tizim"),
    "darwin",
  );
  expect(
    screen.queryByRole("link", { name: /ilovasini yuklab olish/ }),
  ).not.toBeInTheDocument();
  expect(screen.getByLabelText("Ilova uchun protsessor")).toHaveValue("arm64");
  expect(
    screen.getByText(/oʻrnatish fayli hali chiqarilmagan/),
  ).toBeInTheDocument();
});

it("installer roʻyxatini qayta tekshirish yangi versiyaga olib boradi", async () => {
  let current = installer;
  vi.spyOn(globalThis, "fetch").mockImplementation((url) =>
    response(
      String(url).endsWith("/agent/installers")
        ? { items: [current], status: "available" }
        : { items: [] },
    ),
  );
  mount(<Downloads />);
  await screen.findByText("Oxirgi versiya: 1.2.3");
  current = {
    ...installer,
    version: "1.2.4",
    download_url: installer.download_url.replace("1.2.3", "1.2.4"),
  };
  await userEvent.click(
    screen.getByRole("button", { name: "Oxirgi versiyani tekshirish" }),
  );
  await screen.findByText("Oxirgi versiya: 1.2.4");
  expect(
    screen.getByRole("link", { name: "Windows ilovasini yuklab olish" }),
  ).toHaveAttribute("href", current.download_url);
});

it("installer tekshiruvi xatosida soxta yuklash havolasi berilmaydi", async () => {
  vi.spyOn(globalThis, "fetch").mockImplementation((url) =>
    String(url).endsWith("/agent/installers")
      ? response({ detail: "GitHub vaqtincha ishlamayapti" }, 503)
      : response({ items: [] }),
  );
  mount(<Downloads />);
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "GitHub vaqtincha ishlamayapti",
  );
  expect(
    screen.queryByRole("link", { name: /ilovasini yuklab olish/ }),
  ).not.toBeInTheDocument();
});
it("ruxsatlar dastlabki cap bilan cheklangan va mutation CSRF bilan yuboriladi", async () => {
  const fetchMock = vi
    .spyOn(globalThis, "fetch")
    .mockImplementation((url) =>
      String(url).endsWith("/auth/csrf")
        ? response({ csrf_token: "csrf" })
        : response({ scopes: [] }),
    );
  mount(<DeviceSettings device={device} />);
  await userEvent.click(screen.getByText("Ruxsatlar va kuzatuv sozlamalari"));
  expect(
    screen.getByRole("checkbox", { name: /Qurilma trafik statistikasi/ }),
  ).toBeDisabled();
  await userEvent.click(
    screen.getByRole("checkbox", { name: "Brauzerlarni aniqlash" }),
  );
  await userEvent.click(
    screen.getByRole("button", { name: "Ruxsatlarni saqlash" }),
  );
  await screen.findByText(/Ruxsatlar yangilandi/);
  const call = fetchMock.mock.calls.find(([url]) =>
    String(url).endsWith("/d1/scopes"),
  );
  expect(JSON.parse(String(call?.[1]?.body))).toEqual({ scopes: [] });
  expect(call?.[1]?.headers).toMatchObject({ "X-CSRF-Token": "csrf" });
});
it("kuzatuvni pauza qilish real endpointga yoziladi va xato koʻrsatiladi", async () => {
  const fetchMock = vi
    .spyOn(globalThis, "fetch")
    .mockImplementation((url) =>
      String(url).endsWith("/auth/csrf")
        ? response({ csrf_token: "csrf" })
        : response({ detail: "Qurilma ruxsati bekor qilingan" }, 403),
    );
  mount(<DeviceSettings device={device} />);
  await userEvent.click(screen.getByText("Ruxsatlar va kuzatuv sozlamalari"));
  await userEvent.click(
    screen.getByRole("button", { name: "Kuzatuvni toʻxtatish" }),
  );
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Qurilma ruxsati bekor qilingan",
  );
  const call = fetchMock.mock.calls.find(([url]) =>
    String(url).endsWith("/d1/monitoring"),
  );
  expect(JSON.parse(String(call?.[1]?.body))).toEqual({ paused: true });
});

it("SHA-256 nomuvofiqligi binarni saqlashdan oldin rad etiladi", async () => {
  vi.stubGlobal("crypto", {
    subtle: { digest: vi.fn().mockResolvedValue(new Uint8Array(32).buffer) },
  });
  vi.spyOn(globalThis, "fetch").mockImplementation((url) =>
    String(url).endsWith("/agent/releases")
      ? response({
          items: [
            {
              platform: "linux",
              architecture: "amd64",
              filename: "bmp-agent-linux-amd64",
              sha256: "a".repeat(64),
              signature: "imzo",
            },
          ],
        })
      : Promise.resolve(new Response("binar")),
  );
  mount(<Downloads />);
  await userEvent.click(
    await screen.findByRole("button", {
      name: "Tekshirilgan agentni yuklab olish",
    }),
  );
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Fayl nazorat summasi mos kelmadi",
  );
  expect(
    screen.queryByText("Fayl tekshirildi va yuklash boshlandi."),
  ).not.toBeInTheDocument();
});
