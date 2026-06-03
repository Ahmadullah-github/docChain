import type { ReactNode, SVGProps } from "react";

export type IconName =
  | "activity"
  | "alignCenter"
  | "alignLeft"
  | "alignRight"
  | "audit"
  | "bell"
  | "briefcase"
  | "building"
  | "chevronDown"
  | "clock"
  | "document"
  | "dashboard"
  | "edit"
  | "export"
  | "filter"
  | "fullscreen"
  | "hierarchy"
  | "fitWidth"
  | "image"
  | "key"
  | "leaf"
  | "lock"
  | "menu"
  | "more"
  | "move"
  | "plus"
  | "pause"
  | "reports"
  | "reset"
  | "search"
  | "serial"
  | "settings"
  | "shield"
  | "signature"
  | "save"
  | "table"
  | "template"
  | "text"
  | "upload"
  | "userCheck"
  | "userPlus"
  | "userX"
  | "users"
  | "view"
  | "workflow"
  | "zoomIn"
  | "zoomOut"
  | "x";

type IconProps = SVGProps<SVGSVGElement> & {
  name: IconName;
};

const paths: Record<IconName, ReactNode> = {
  activity: (
    <path d="M4 12h3l2-5 4 10 2-5h5" />
  ),
  alignCenter: (
    <path d="M5 6h14M8 10h8M5 14h14M8 18h8" />
  ),
  alignLeft: (
    <path d="M4 6h16M4 10h11M4 14h16M4 18h11" />
  ),
  alignRight: (
    <path d="M4 6h16M9 10h11M4 14h16M9 18h11" />
  ),
  audit: (
    <>
      <path d="M7 3h8l4 4v14H7z" />
      <path d="M15 3v5h5M10 12h6M10 16h6M10 20h4" />
    </>
  ),
  bell: (
    <>
      <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" />
      <path d="M10 21a2 2 0 0 0 4 0" />
    </>
  ),
  briefcase: (
    <>
      <path d="M9 6V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v1" />
      <path d="M3 7h18v12H3zM3 12h18M10 12v2h4v-2" />
    </>
  ),
  building: (
    <>
      <path d="M4 21h16M6 21V7l6-4 6 4v14" />
      <path d="M9 10h1M14 10h1M9 14h1M14 14h1M11 21v-4h2v4" />
    </>
  ),
  chevronDown: (
    <path d="m6 9 6 6 6-6" />
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </>
  ),
  dashboard: (
    <>
      <path d="M4 13a8 8 0 0 1 16 0v7H4z" />
      <path d="M12 13 16 9M7 17h.01M17 17h.01" />
    </>
  ),
  document: (
    <>
      <path d="M7 3h7l5 5v13H7z" />
      <path d="M14 3v6h5M10 13h6M10 17h6" />
    </>
  ),
  edit: (
    <>
      <path d="M4 20h4l11-11-4-4L4 16z" />
      <path d="m13 7 4 4" />
    </>
  ),
  export: (
    <>
      <path d="M12 3v12" />
      <path d="m7 10 5 5 5-5M5 21h14" />
    </>
  ),
  filter: (
    <>
      <path d="M4 5h16l-6 7v5l-4 2v-7z" />
      <path d="M9 5v0" />
    </>
  ),
  fullscreen: (
    <>
      <path d="M8 3H3v5M16 3h5v5M8 21H3v-5M21 16v5h-5" />
      <path d="M3 3l6 6M21 3l-6 6M3 21l6-6M21 21l-6-6" />
    </>
  ),
  hierarchy: (
    <>
      <path d="M12 4v5M6 20v-5h12v5M6 15V9h12v6" />
      <path d="M9 4h6v5H9zM3 20h6M15 20h6" />
    </>
  ),
  fitWidth: (
    <>
      <path d="M4 7h16v10H4z" />
      <path d="M8 12h8M8 12l3-3M8 12l3 3M16 12l-3-3M16 12l-3 3" />
    </>
  ),
  image: (
    <>
      <path d="M4 5h16v14H4z" />
      <circle cx="9" cy="10" r="2" />
      <path d="m4 17 5-5 4 4 2-2 5 5" />
    </>
  ),
  key: (
    <>
      <circle cx="7" cy="15" r="4" />
      <path d="M10 12 21 1M15 7l2 2M18 4l2 2" />
    </>
  ),
  menu: (
    <path d="M4 7h16M4 12h16M4 17h16" />
  ),
  leaf: (
    <>
      <path d="M5 21c0-7 4-13 14-16 1 10-5 14-12 14" />
      <path d="M5 21c3-5 7-8 12-10" />
    </>
  ),
  lock: (
    <>
      <path d="M6 11h12v10H6z" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
    </>
  ),
  more: (
    <>
      <circle cx="5" cy="12" r="1" />
      <circle cx="12" cy="12" r="1" />
      <circle cx="19" cy="12" r="1" />
    </>
  ),
  plus: (
    <path d="M12 5v14M5 12h14" />
  ),
  pause: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M9 8v8M15 8v8" />
    </>
  ),
  move: (
    <>
      <path d="M12 3v18M3 12h18" />
      <path d="m8 7 4-4 4 4M8 17l4 4 4-4M7 8l-4 4 4 4M17 8l4 4-4 4" />
    </>
  ),
  reports: (
    <>
      <path d="M5 20V9M12 20V4M19 20v-7" />
      <path d="M3 20h18" />
    </>
  ),
  reset: (
    <>
      <path d="M4 12a8 8 0 1 0 2.34-5.66" />
      <path d="M4 4v6h6" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </>
  ),
  serial: (
    <>
      <path d="M7 8h10M7 12h10M7 16h10" />
      <path d="M5 4h14v16H5z" />
    </>
  ),
  settings: (
    <>
      <path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" />
      <path d="M19.4 15a1.8 1.8 0 0 0 .36 1.98l.04.04-2 3-.05-.02a1.8 1.8 0 0 0-2.08.15 1.8 1.8 0 0 0-.67 1.85H9a1.8 1.8 0 0 0-.67-1.85 1.8 1.8 0 0 0-2.08-.15l-.05.02-2-3 .04-.04A1.8 1.8 0 0 0 4.6 15a1.8 1.8 0 0 0-1.6-1V10a1.8 1.8 0 0 0 1.6-1 1.8 1.8 0 0 0-.36-1.98L4.2 6.98l2-3 .05.02a1.8 1.8 0 0 0 2.08-.15A1.8 1.8 0 0 0 9 2h6a1.8 1.8 0 0 0 .67 1.85 1.8 1.8 0 0 0 2.08.15l.05-.02 2 3-.04.04A1.8 1.8 0 0 0 19.4 9a1.8 1.8 0 0 0 1.6 1v4a1.8 1.8 0 0 0-1.6 1Z" />
    </>
  ),
  shield: (
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" />
  ),
  save: (
    <>
      <path d="M5 3h12l2 2v16H5z" />
      <path d="M8 3v6h8V3M8 21v-7h8v7" />
    </>
  ),
  signature: (
    <>
      <path d="M5 18c5-10 7-10 6-4-.6 3.7 4.5-1 5 1 .4 1.5-2 3 3 3" />
      <path d="M15 5l4 4M14 6l4-4 4 4-4 4z" />
    </>
  ),
  template: (
    <>
      <path d="M4 4h16v16H4z" />
      <path d="M8 8h8M8 12h8M8 16h4" />
    </>
  ),
  table: (
    <>
      <path d="M4 5h16v14H4zM4 10h16M4 15h16M10 5v14M16 5v14" />
    </>
  ),
  text: (
    <>
      <path d="M5 5h14M12 5v14M9 19h6" />
    </>
  ),
  upload: (
    <>
      <path d="M12 21V9" />
      <path d="m7 14 5-5 5 5M5 21h14" />
      <path d="M5 5h14" />
    </>
  ),
  userCheck: (
    <>
      <path d="M16 21v-2a4 4 0 0 0-8 0v2" />
      <circle cx="12" cy="7" r="4" />
      <path d="m16 11 2 2 4-4" />
    </>
  ),
  userPlus: (
    <>
      <path d="M16 21v-2a4 4 0 0 0-8 0v2" />
      <circle cx="12" cy="7" r="4" />
      <path d="M19 8v6M16 11h6" />
    </>
  ),
  userX: (
    <>
      <path d="M16 21v-2a4 4 0 0 0-8 0v2" />
      <circle cx="12" cy="7" r="4" />
      <path d="m18 8 4 4M22 8l-4 4" />
    </>
  ),
  users: (
    <>
      <path d="M16 21v-2a4 4 0 0 0-8 0v2" />
      <circle cx="12" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87M2 21v-2a4 4 0 0 1 3-3.87" />
    </>
  ),
  view: (
    <>
      <path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
  workflow: (
    <>
      <path d="M6 5h6v6H6zM12 18h6v-6h-6z" />
      <path d="M12 8h4a2 2 0 0 1 2 2v2M12 15H8a2 2 0 0 1-2-2v-2" />
    </>
  ),
  x: (
    <path d="M6 6l12 12M18 6 6 18" />
  ),
  zoomIn: (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5M11 8v6M8 11h6" />
    </>
  ),
  zoomOut: (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5M8 11h6" />
    </>
  )
};

export function Icon({ name, className, ...props }: IconProps) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.8"
      viewBox="0 0 24 24"
      {...props}
    >
      {paths[name]}
    </svg>
  );
}
