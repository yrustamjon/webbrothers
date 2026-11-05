import { useState } from "react";
export default function LocalPasswords({ browser }: { browser: string }) {
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState(false);
  const addresses: Record<string, string> = {
    chrome: "chrome://password-manager/passwords",
    edge: "edge://settings/autofill/passwords",
    brave: "brave://password-manager/passwords",
    firefox: "about:logins",
  };
  const address = addresses[browser];
  return (
    <div className="local-passwords">
      <div className="section-kicker">
        <span aria-hidden="true">◇</span>
        <span>PAROLNI KOMPYUTERINGIZDA KOʻRISH</span>
      </div>
      <h3>Brauzer parol menejeri</h3>
      <p>
        {browser === "safari"
          ? "Mac kompyuteringizda Passwords ilovasini yoki Safari → Settings → Passwords boʻlimini oching va OS tasdigʻidan oʻting."
          : "Tanlangan qurilmada aynan shu brauzer profilini oching. Quyidagi manzilni uning manzil satriga qoʻying; brauzer talab qilsa OS tasdigʻidan oʻting."}
      </p>
      {address && (
        <div className="password-manager-address">
          <code>{address}</code>
          <button
            className="secondary"
            onClick={async () => {
              try {
                if (!navigator.clipboard) throw new Error();
                await navigator.clipboard.writeText(address);
                setCopied(true);
                setCopyError(false);
              } catch {
                setCopyError(true);
              }
            }}
          >
            {copied ? "Nusxalandi" : "Manzilni nusxalash"}
          </button>
        </div>
      )}
      {copyError && <p role="status">Manzilni qoʻlda nusxalang.</p>}
      <small>
        Bu sayt parol qiymatlarini oʻqimaydi va parol menejerini masofadan
        ochmaydi.
      </small>
    </div>
  );
}
