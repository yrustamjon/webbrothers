import { useState, type ReactNode } from "react";
export default function VirtualList<T>({
  items,
  rowHeight = 112,
  height = 448,
  label,
  renderItem,
}: {
  items: T[];
  rowHeight?: number;
  height?: number;
  label: string;
  renderItem: (item: T, index: number) => ReactNode;
}) {
  const [scrollTop, setScrollTop] = useState(0);
  const start = Math.max(
    0,
    Math.min(
      Math.max(0, items.length - Math.ceil(height / rowHeight)),
      Math.floor(scrollTop / rowHeight) - 3,
    ),
  );
  const end = Math.min(items.length, start + Math.ceil(height / rowHeight) + 6);
  return (
    <div
      className="virtual-list"
      role="region"
      aria-label={label}
      tabIndex={0}
      style={{
        height: Math.min(height, Math.max(rowHeight, items.length * rowHeight)),
        overflowY: "auto",
        position: "relative",
      }}
      onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}
    >
      <div
        role="list"
        style={{ height: items.length * rowHeight, position: "relative" }}
      >
        {items.slice(start, end).map((item, offset) => (
          <div
            role="listitem"
            key={start + offset}
            className="virtual-row"
            aria-posinset={start + offset + 1}
            aria-setsize={items.length}
            style={{
              position: "absolute",
              top: (start + offset) * rowHeight,
              minHeight: rowHeight,
              height: rowHeight,
              left: 0,
              right: 0,
            }}
          >
            {renderItem(item, start + offset)}
          </div>
        ))}
      </div>
    </div>
  );
}
