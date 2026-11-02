import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api, type Device } from "./api";
import { scopes } from "./model.mjs";
export default function DeviceSettings({ device }: { device: Device }) {
  const client = useQueryClient();
  const [chosen, setChosen] = useState(device.scopes);
  const [notice, setNotice] = useState("");
  useEffect(() => {
    setChosen(device.scopes);
  }, [device.id, device.scopes.join(",")]);
  const refresh = () => {
    client.removeQueries({
      predicate: (q) =>
        ["history", "inventory", "browsers", "traffic"].includes(
          String(q.queryKey[0]),
        ) && q.queryKey[1] === device.id,
    });
    void client.invalidateQueries({ queryKey: ["devices"] });
  };
  const permission = useMutation({
    mutationFn: () =>
      api(`/devices/${encodeURIComponent(device.id)}/scopes`, {
        scopes: chosen,
      }),
    onSuccess: () => {
      setNotice(
        "Ruxsatlar yangilandi. Agent yangi ruxsatlar bilan qayta ulanadi.",
      );
      refresh();
    },
  });
  const monitor = useMutation({
    mutationFn: () =>
      api(`/devices/${encodeURIComponent(device.id)}/monitoring`, {
        paused: !device.monitoring_paused,
      }),
    onSuccess: () => {
      setNotice(
        device.monitoring_paused
          ? "Kuzatuv davom ettirildi."
          : "Kuzatuv toʻxtatildi. Yangi maʼlumot soʻrovlari rad etiladi.",
      );
      refresh();
    },
  });
  const available = device.enrolled_scopes;
  if (!available)
    return (
      <p className="muted">
        Qurilmaning dastlabki ruxsatlari serverdan olinmagan. Ruxsatlarni
        oʻzgartirish mavjud emas.
      </p>
    );
  return (
    <details className="device-settings">
      <summary>Ruxsatlar va kuzatuv sozlamalari</summary>
      <p>
        Faqat qurilmani ulashda mahalliy tasdiqlangan ruxsatlarni qayta yoqish
        mumkin. Yangi toifa qoʻshish uchun agentni qayta ulang.
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          setNotice("");
          permission.mutate();
        }}
      >
        <fieldset>
          <legend>Faol ruxsatlar</legend>
          {scopes.map(([scope, label]) => (
            <label className="check" key={scope}>
              <input
                type="checkbox"
                checked={chosen.includes(scope)}
                disabled={!available.includes(scope) || permission.isPending}
                onChange={(e) =>
                  setChosen(
                    e.target.checked
                      ? [...chosen, scope]
                      : chosen.filter((item) => item !== scope),
                  )
                }
              />
              {label}
              {!available.includes(scope) && " — ulashda ruxsat berilmagan"}
            </label>
          ))}
        </fieldset>
        <button disabled={permission.isPending || device.status === "revoked"}>
          Ruxsatlarni saqlash
        </button>
      </form>
      <p>
        <strong>
          Kuzatuv holati: {device.monitoring_paused ? "Toʻxtatilgan" : "Faol"}
        </strong>
      </p>
      <button
        className="secondary"
        disabled={monitor.isPending || device.status === "revoked"}
        onClick={() => {
          setNotice("");
          monitor.mutate();
        }}
      >
        {device.monitoring_paused
          ? "Kuzatuvni davom ettirish"
          : "Kuzatuvni toʻxtatish"}
      </button>
      <p className="muted">
        Bu boshqaruv markaziy soʻrovlarni toʻxtatadi. Mahalliy agent jarayonini
        toʻxtatish uchun OS xizmat boshqaruvidan foydalaning.
      </p>
      {notice && <p role="status">{notice}</p>}
      {permission.error && (
        <p role="alert" className="error">
          {permission.error.message}
        </p>
      )}
      {monitor.error && (
        <p role="alert" className="error">
          {monitor.error.message}
        </p>
      )}
    </details>
  );
}
