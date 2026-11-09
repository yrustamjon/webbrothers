import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import DeviceOverview from "../src/DeviceOverview";
const devices = [
  {
    id: "old",
    display_name: "Old computer",
    operating_system: "darwin",
    architecture: "arm64",
    status: "revoked",
    scopes: [],
  },
  {
    id: "off",
    display_name: "Office Windows",
    operating_system: "windows",
    architecture: "amd64",
    status: "offline",
    scopes: [],
  },
  {
    id: "on",
    display_name: "Work Mac",
    operating_system: "darwin",
    architecture: "arm64",
    status: "online",
    scopes: [],
  },
];
function mount() {
  const onOpen = vi.fn();
  render(
    <DeviceOverview
      devices={devices}
      loading={false}
      refreshing={false}
      busy={false}
      onOpen={onOpen}
      onAdd={vi.fn()}
      onDownload={vi.fn()}
      onRefresh={vi.fn()}
      onRevoke={vi.fn()}
      onRemove={vi.fn()}
    />,
  );
  return onOpen;
}
describe("device overview", () => {
  it("orders online devices first and keeps revoked devices out of active list", () => {
    const open = mount();
    const list = screen.getByRole("list", { name: "Faol qurilmalar" });
    const rows = within(list).getAllByRole("listitem");
    expect(rows[0]).toHaveTextContent("Work Mac");
    expect(rows[1]).toHaveTextContent("Office Windows");
    expect(within(list).queryByText("Old computer")).not.toBeInTheDocument();
    fireEvent.click(within(rows[0]).getByRole("button", { name: /Ochish/ }));
    expect(open).toHaveBeenCalledWith("on");
  });
  it("filters by status and device search without fetching browser content", () => {
    mount();
    fireEvent.change(screen.getByLabelText("Ulanish holati"), {
      target: { value: "offline" },
    });
    expect(
      screen.queryByRole("button", { name: "Work Mac" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Office Windows" }),
    ).toBeVisible();
    fireEvent.change(screen.getByRole("searchbox"), {
      target: { value: "not-found" },
    });
    expect(screen.getByText("Qidiruvga mos qurilma topilmadi.")).toBeVisible();
  });
});
