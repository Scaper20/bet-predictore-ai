type ProductIconName =
  | "chart"
  | "medal"
  | "trending-up"
  | "bolt"
  | "target"
  | "scale"
  | "search"
  | "globe"
  | "calendar"
  | "star";

export function ProductIcon({
  name,
  className = "size-5",
}: {
  name: ProductIconName;
  className?: string;
}) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      {name === "chart" && <>
        <path d="M4 19.5h16" />
        <path d="M6.5 16V11m5 5V5m5 11v-7" />
        <circle cx="6.5" cy="8.5" r="1" />
        <circle cx="11.5" cy="3.5" r="1" />
        <circle cx="16.5" cy="6" r="1" />
      </>}
      {name === "medal" && <>
        <path d="m8 3 4 6 4-6" />
        <circle cx="12" cy="14" r="6" />
        <path d="m10 14 1.3 1.3L14.5 12" />
      </>}
      {name === "trending-up" && <>
        <path d="M4 17.5 9 12l3.5 3.5L20 7" />
        <path d="M14.5 7H20v5.5" />
      </>}
      {name === "bolt" && <path d="M13.5 2.8 5.8 13h5.6l-.9 8.2L18.2 11h-5.7z" />}
      {name === "target" && <>
        <circle cx="12" cy="12" r="8.5" />
        <circle cx="12" cy="12" r="4.5" />
        <circle cx="12" cy="12" r=".8" fill="currentColor" stroke="none" />
      </>}
      {name === "scale" && <>
        <path d="M12 4v16m-6 0h12M5 7h14" />
        <path d="m5 7-3 6h6zm14 0-3 6h6z" />
        <circle cx="12" cy="4" r="1" />
      </>}
      {name === "search" && <>
        <circle cx="10.8" cy="10.8" r="6.3" />
        <path d="m15.5 15.5 4.2 4.2" />
      </>}
      {name === "globe" && <>
        <circle cx="12" cy="12" r="9" />
        <path d="M3.5 9h17M3.5 15h17M12 3c2.4 2.4 3.5 5.4 3.5 9s-1.1 6.6-3.5 9c-2.4-2.4-3.5-5.4-3.5-9S9.6 5.4 12 3Z" />
      </>}
      {name === "calendar" && <>
        <rect x="3.5" y="5" width="17" height="15.5" rx="2" />
        <path d="M7.5 3v4m9-4v4M3.5 9.5h17" />
        <path d="m9 14 2 2 4-4" />
      </>}
      {name === "star" && <path d="m12 3 2.7 5.5 6.1.9-4.4 4.3 1 6.1-5.4-2.9-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z" />}
    </svg>
  );
}
