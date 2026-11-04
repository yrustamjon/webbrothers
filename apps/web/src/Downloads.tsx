import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { api, APIError } from "./api";
type Release = {
  version?: string;
  platform: string;
  architecture: string;
  filename: string;
  sha256: string;
  signature: string;
  download_url: string;
};
const platforms = [
  ["linux", "Linux"],
  ["darwin", "macOS"],
  ["windows", "Windows"],
];
type Installer = {
  platform: "darwin" | "windows";
  architecture: "amd64" | "arm64";
  filename: string;
  version: string;
  download_url: string;
  release_url: string;
  sha256: string;
};

export default function Downloads() {
  const [platform, setPlatform] = useState(
    /Mac/i.test(navigator.platform) ? "darwin" : "windows",
  );
  const [arch, setArch] = useState(platform === "darwin" ? "arm64" : "amd64");
  const installers = useQuery<{
    items: Installer[];
    status: "available" | "unavailable";
  }>({
    queryKey: ["agent-installers"],
    queryFn: () => api("/agent/installers"),
    staleTime: 0,
    refetchInterval: 60_000,
    refetchOnWindowFocus: "always",
  });
  const selected = installers.data?.items.find(
    (item) => item.platform === platform && item.architecture === arch,
  );
  return (
    <>
      <section className="panel">
        <h1>Agent ilovasini oʻrnatish</h1>
        <p>
          Windows va macOS uchun oxirgi nashr GitHub Releases orqali olinadi.
          Roʻyxat har daqiqada va sahifaga qaytganingizda yangilanadi.
        </p>
        <div className="filters">
          <label>
            Ilova uchun operatsion tizim
            <select
              value={platform}
              onChange={(event) => {
                setPlatform(event.target.value);
                setArch(event.target.value === "darwin" ? "arm64" : "amd64");
              }}
            >
              <option value="windows">Windows</option>
              <option value="darwin">macOS</option>
            </select>
          </label>
          <label>
            Ilova uchun protsessor
            <select
              value={arch}
              onChange={(event) => setArch(event.target.value)}
            >
              {platform === "darwin" && (
                <option value="arm64">Apple Silicon (M1, M2, M3, M4…)</option>
              )}
              <option value="amd64">
                {platform === "darwin" ? "Intel Mac" : "Intel / AMD (64-bit)"}
              </option>
            </select>
          </label>
          <button
            className="secondary"
            onClick={() => installers.refetch()}
            disabled={installers.isFetching}
          >
            Oxirgi versiyani tekshirish
          </button>
        </div>
        {installers.isPending && (
          <p role="status">Oxirgi nashr qidirilmoqda…</p>
        )}
        {installers.error && (
          <p role="alert" className="error">
            Oxirgi nashrni tekshirib boʻlmadi. {installers.error.message}
          </p>
        )}
        {installers.data && !selected && (
          <p role="status">
            Tanlangan tizim uchun oʻrnatish fayli hali chiqarilmagan yoki
            nashrni tekshirish vaqtincha ishlamayapti. Keyinroq qayta
            tekshiring.
          </p>
        )}
        {selected && (
          <article className="release">
            <h2>Oxirgi versiya: {selected.version}</h2>
            <p>{selected.filename}</p>
            <p>
              <a href={selected.download_url} rel="noreferrer">
                {platform === "darwin" ? "macOS" : "Windows"} ilovasini yuklab
                olish
              </a>
            </p>
            <p>
              <a href={selected.release_url} target="_blank" rel="noreferrer">
                Nashr tafsilotlari va tekshiruv fayllari
              </a>
            </p>
            {selected.sha256 && (
              <details>
                <summary>SHA-256 nazorat summasi</summary>
                <code>{selected.sha256}</code>
              </details>
            )}
          </article>
        )}
        <h2>Oʻrnatish va ulash</h2>
        <ol>
          <li>
            {platform === "darwin"
              ? "DMG faylini oching, WebBrothers Agent ilovasini Applications katalogiga koʻchiring va oching."
              : "Setup faylini ochib oʻrnating. Start menyusidan WebBrothers Agent ilovasini oching."}
          </li>
          <li>
            Ilova oynasida serverning HTTPS manzilini kiriting. Brauzer va
            profilni aniqlash hamda tarixni oʻqishga faqat roziligingiz bilan
            ruxsat bering.
          </li>
          <li>
            Ilovadagi ulash kodini saytdagi “Qurilma ulash” boʻlimida
            tasdiqlang. Agent ishlayotgan oynani ochiq qoldiring; toʻxtatish
            uchun Ctrl+C.
          </li>
        </ol>
        <p>
          Yangilash uchun agentni toʻxtating va shu sahifadagi oxirgi versiyani
          qayta oʻrnating. Mahalliy ulanish va sozlamalar saqlanadi. Avtomatik
          yangilanish yoki fonda ishga tushish hozir yoqilmagan.
        </p>
        <p className="muted">
          Paket mavjudligi Windows/macOSda amaliy sinov yoki OS imzosi borligini
          anglatmaydi. Imzo va tekshiruv holatini nashr tafsilotlaridan koʻring.
          Qurilma trafik hisoblagichlari Windows/macOSda mavjud; Safari tarixi
          macOS ruxsatlariga bogʻliq. Login metamaʼlumotlari Chrome/Edge/Brave
          uchun; Firefox/Safari login inventari qoʻllanmaydi.
        </p>
      </section>
      <details className="panel">
        <summary>Terminal uchun imzolangan agent binarlari</summary>
        <SignedBinaries />
      </details>
    </>
  );
}

function SignedBinaries() {
  const [platform, setPlatform] = useState("linux");
  const [arch, setArch] = useState("amd64");
  const releases = useQuery<{ items: Release[] }>({
    queryKey: ["agent-releases"],
    queryFn: () => api("/agent/releases"),
  });
  const selected = releases.data?.items.find(
    (item) => item.platform === platform && item.architecture === arch,
  );
  const download = useMutation({
    mutationFn: async (release: Release) => {
      const response = await fetch(
        `/api/v1/agent/download/${platform}/${arch}`,
        { credentials: "include", cache: "no-store" },
      );
      if (!response.ok) {
        const error = await response.json().catch(() => null);
        throw new APIError(
          response.status,
          typeof error?.detail === "string"
            ? error.detail
            : "Agentni yuklab boʻlmadi.",
        );
      }
      const content = await response.arrayBuffer();
      const digest = await crypto.subtle.digest("SHA-256", content);
      const actual = Array.from(new Uint8Array(digest), (n) =>
        n.toString(16).padStart(2, "0"),
      ).join("");
      if (actual !== release.sha256)
        throw new Error(
          "Fayl nazorat summasi mos kelmadi. Yuklash bekor qilindi.",
        );
      const href = URL.createObjectURL(
        new Blob([content], { type: "application/octet-stream" }),
      );
      const link = document.createElement("a");
      link.href = href;
      link.download = release.filename;
      link.click();
      setTimeout(() => URL.revokeObjectURL(href), 1000);
    },
  });
  const executable =
    platform === "windows"
      ? `.\\bmp-agent-windows-${arch}.exe`
      : `./bmp-agent-${platform}-${arch}`;
  return (
    <section className="panel">
      <h1>Agentni yuklab olish</h1>
      <p>
        Faqat server nashr kaliti bilan platforma, arxitektura, versiya va fayl
        summasiga bogʻlangan Ed25519 manifesti tekshirilgan nashrlar
        koʻrsatiladi. Yuklashda SHA-256 ham tekshiriladi.
      </p>
      <div className="filters">
        <label>
          Operatsion tizim
          <select
            value={platform}
            onChange={(e) => {
              setPlatform(e.target.value);
              download.reset();
            }}
          >
            {platforms.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Protsessor arxitekturasi
          <select
            value={arch}
            onChange={(e) => {
              setArch(e.target.value);
              download.reset();
            }}
          >
            <option value="amd64">x86-64 (amd64)</option>
            <option value="arm64">ARM64</option>
          </select>
        </label>
        <button className="secondary" onClick={() => releases.refetch()}>
          Roʻyxatni yangilash
        </button>
      </div>
      {releases.isPending && (
        <p role="status">Imzolangan nashrlar tekshirilmoqda…</p>
      )}
      {releases.error && (
        <p role="alert" className="error">
          {releases.error.message}
        </p>
      )}
      {releases.data && !selected && (
        <p role="status">
          Tanlangan tizim uchun imzolangan agent paketi hali mavjud emas.
          Administrator nashrni tayyorlashi kerak.
        </p>
      )}
      {selected && (
        <article className="release">
          <h2>{selected.filename}</h2>
          {selected.version && <p>Versiya: {selected.version}</p>}
          <p>
            <strong>SHA-256</strong>
          </p>
          <code>{selected.sha256}</code>
          <details>
            <summary>Manifestning Ed25519 imzosi</summary>
            <code>{selected.signature}</code>
          </details>
          <button
            onClick={() => download.mutate(selected)}
            disabled={download.isPending}
          >
            {download.isPending
              ? "Tekshirilmoqda va yuklanmoqda…"
              : "Tekshirilgan agentni yuklab olish"}
          </button>
        </article>
      )}
      {download.error && (
        <p role="alert" className="error">
          {download.error.message}
        </p>
      )}
      {download.isSuccess && (
        <p role="status">Fayl tekshirildi va yuklash boshlandi.</p>
      )}
      <h2>Oʻrnatish va ulash</h2>
      <ol>
        <li>
          Faqat oʻzingiz boshqaradigan OS foydalanuvchisi nomidan ishga
          tushiring. Agentni root yoki boshqa foydalanuvchi nomidan boshlamang.
        </li>
        <li>
          <code>BROWSER_AGENT_KEY_PASSPHRASE</code> mahalliy sirini kamida 16
          belgili qiymat bilan OS maxfiy saqlash vositasi orqali taʼminlang.
          Sirni chatga, kodga yoki shell tarixiga yozmang.
        </li>
        <li>
          {platform !== "windows" && (
            <>
              Faylni bajariladigan qiling:{" "}
              <code>
                chmod u+x bmp-agent-{platform}-{arch}
              </code>
              .{" "}
            </>
          )}
          Quyidagi buyruqda server manzilini oʻzingizning HTTPS manzilingizga
          almashtiring. TLS sertifikati haqiqiy va ishonchli boʻlishi kerak.
        </li>
      </ol>
      <pre>{`${executable} --action pair --server https://SIZNING-SERVERINGIZ --scopes browser.discovery,profile.discovery,history.read,traffic.aggregate\n${executable} --action run --server https://SIZNING-SERVERINGIZ`}</pre>
      <p>
        Agent koʻrsatgan kodni “Qurilma ulash” boʻlimida tasdiqlang. Mahalliy
        ruxsatlar bilan dashboarddagi ruxsatlar mos boʻlishi kerak.
      </p>
      <h3>Xizmat sifatida ishlash</h3>
      {platform === "linux" ? (
        <p>
          Linux uchun loyiha{" "}
          <code>installers/linux/browser-monitoring.service</code> faylida
          foydalanuvchi systemd namunasi mavjud. Server yoʻli va himoyalangan
          mahalliy sir muhitini sozlang. Bu avtomatik installer emas.
          Toʻxtatish:{" "}
          <code>systemctl --user disable --now browser-monitoring</code>.
          systemd mavjud boʻlmasa <code>--action run</code> foreground rejimidan
          foydalaning.
        </p>
      ) : platform === "darwin" ? (
        <p>
          macOS LaunchAgent namunasi loyiha <code>installers/macos/</code>{" "}
          katalogida. Keychain orqali sir yetkazish va haqiqiy macOS sinovi
          talab qilinadi. Hozir foreground rejimi uchun koʻrsatmalar berilgan;
          avtomatik oʻrnatilgan xizmat deb hisoblamang.
        </p>
      ) : (
        <p>
          Windows Service integratsiyasi hali mavjud emas. Agent hozir
          foreground rejimida ishlaydi; toʻxtatish uchun Ctrl+C. Avtomatik
          xizmat sifatida ishga tushish vaʼda qilinmaydi.
        </p>
      )}
      <p className="muted">
        Linux/Windows/macOS qurilma trafik yigʻindisi, Safari tarixi va Chromium
        oilasida parollarsiz login metamaʼlumotlari mavjud. Paket mavjudligi OS
        sinovidan oʻtganlik kafolati emas.
      </p>
      <h3>Oʻchirish</h3>
      <p>
        Dashboardda qurilma ruxsatini bekor qiling, jarayon yoki foydalanuvchi
        xizmatini toʻxtating, soʻng binar, xizmat sozlamalari va shifrlangan
        mahalliy identifikatorni oʻchiring. Yashirin oʻrnatish yoki toʻxtatishni
        cheklash yoʻq.
      </p>
    </section>
  );
}
