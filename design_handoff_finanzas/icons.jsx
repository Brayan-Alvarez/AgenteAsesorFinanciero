// Lightweight inline SVG icons (Lucide-style, stroke-based)

const Icon = ({ children, size = 18, ...rest }) => (
  <svg
    width={size} height={size}
    viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="1.8"
    strokeLinecap="round" strokeLinejoin="round"
    {...rest}
  >
    {children}
  </svg>
);

const Icons = {
  Home: (p) => <Icon {...p}><path d="M3 12l9-9 9 9"/><path d="M5 10v10h14V10"/></Icon>,
  List: (p) => <Icon {...p}><path d="M8 6h13"/><path d="M8 12h13"/><path d="M8 18h13"/><circle cx="3.5" cy="6" r="1"/><circle cx="3.5" cy="12" r="1"/><circle cx="3.5" cy="18" r="1"/></Icon>,
  Wallet: (p) => <Icon {...p}><path d="M3 7a2 2 0 0 1 2-2h13a2 2 0 0 1 2 2v3"/><path d="M3 7v10a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-3"/><path d="M16 13a2 2 0 0 0 0 4h5v-4z"/></Icon>,
  Sparkle: (p) => <Icon {...p}><path d="M12 3l1.6 4.4L18 9l-4.4 1.6L12 15l-1.6-4.4L6 9l4.4-1.6z"/><path d="M19 14l.7 1.8L21.5 16.5l-1.8.7L19 19l-.7-1.8L16.5 16.5l1.8-.7z"/></Icon>,
  Plus: (p) => <Icon {...p}><path d="M12 5v14"/><path d="M5 12h14"/></Icon>,
  ChevronLeft: (p) => <Icon {...p}><path d="M15 18l-6-6 6-6"/></Icon>,
  ChevronRight: (p) => <Icon {...p}><path d="M9 6l6 6-6 6"/></Icon>,
  X: (p) => <Icon {...p}><path d="M6 6l12 12"/><path d="M6 18l12-12"/></Icon>,
  Search: (p) => <Icon {...p}><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></Icon>,
  Filter: (p) => <Icon {...p}><path d="M3 5h18"/><path d="M6 12h12"/><path d="M10 19h4"/></Icon>,
  Users: (p) => <Icon {...p}><circle cx="9" cy="8" r="3.5"/><path d="M3 20c0-3 3-5 6-5s6 2 6 5"/><circle cx="17" cy="9" r="2.5"/><path d="M16 14c2.5 0 5 1.5 5 4"/></Icon>,
  Trending: (p) => <Icon {...p}><path d="M3 17l6-6 4 4 8-8"/><path d="M14 7h7v7"/></Icon>,
  AlertTri: (p) => <Icon {...p}><path d="M12 3l10 17H2z"/><path d="M12 9v5"/><circle cx="12" cy="17.5" r="0.5" fill="currentColor"/></Icon>,
  Edit: (p) => <Icon {...p}><path d="M4 20h4l10-10-4-4L4 16z"/><path d="M14 6l4 4"/></Icon>,
  Trash: (p) => <Icon {...p}><path d="M4 7h16"/><path d="M9 7V4h6v3"/><path d="M6 7l1 13h10l1-13"/></Icon>,
  Calendar: (p) => <Icon {...p}><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18"/><path d="M8 3v4"/><path d="M16 3v4"/></Icon>,
  Settings: (p) => <Icon {...p}><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.6 1.6 0 0 0 .3 1.7l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-1.7-.3 1.6 1.6 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.6 1.6 0 0 0-1-1.5 1.6 1.6 0 0 0-1.7.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0 .3-1.7 1.6 1.6 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.6 1.6 0 0 0 1.5-1 1.6 1.6 0 0 0-.3-1.7l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.7.3 1.6 1.6 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 1 1.5 1.6 1.6 0 0 0 1.7-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.7 1.6 1.6 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1z"/></Icon>,
  ArrowUp: (p) => <Icon {...p}><path d="M12 19V5"/><path d="M5 12l7-7 7 7"/></Icon>,
  ArrowDown: (p) => <Icon {...p}><path d="M12 5v14"/><path d="M5 12l7 7 7-7"/></Icon>,
  PiggyBank: (p) => <Icon {...p}><path d="M19 12c0 4-3 7-8 7s-8-3-8-7c0-3 2-5 5-6 1-2 3-3 5-3 1 0 2 .5 2 .5L17 5l-1 2c1 1 3 3 3 5z"/><circle cx="9" cy="11" r="0.6" fill="currentColor"/></Icon>,
  Bell: (p) => <Icon {...p}><path d="M6 8a6 6 0 0 1 12 0c0 7 3 8 3 8H3s3-1 3-8z"/><path d="M10 21a2 2 0 0 0 4 0"/></Icon>,
  Target: (p) => <Icon {...p}><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.5" fill="currentColor"/></Icon>,
};

window.Icons = Icons;
