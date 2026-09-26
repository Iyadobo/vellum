import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Icon, type IconName } from "../../components/Icon";
import "./menus.css";

export interface MenuItem {
  id: string;
  label: string;
  shortcut?: string;
  icon?: IconName;
  danger?: boolean;
  disabled?: boolean;
  checked?: boolean;
  separatorBefore?: boolean;
  onSelect?: () => void;
}

export interface MenuAnchor {
  x: number;
  y: number;
  width?: number;
  align?: "left" | "right";
}

export interface MenuRequest {
  items: MenuItem[];
  anchor: MenuAnchor;
  title?: string;
}

interface MenuContextValue {
  open(request: MenuRequest): void;
  close(): void;
  isOpen: boolean;
}

interface MenuPlacement {
  left: number;
  top: number;
  flipped: boolean;
}

const MenuContext = createContext<MenuContextValue | null>(null);

const ITEM_HEIGHT = 36;
const SEPARATOR_HEIGHT = 9;
const SURFACE_PADDING = 8;
const VIEWPORT_MARGIN = 8;
const MAX_SURFACE_HEIGHT = 480;
const DEFAULT_WIDTH = 240;

function nextEnabledIndex(items: MenuItem[], from: number, dir: 1 | -1): number {
  if (!items.length) return -1;
  let i = from;
  for (let steps = 0; steps < items.length; steps++) {
    i = (i + dir + items.length) % items.length;
    const item = items[i];
    if (!item.disabled && item.label) return i;
  }
  return -1;
}

function placeMenu(anchor: MenuAnchor, width: number, height: number): MenuPlacement {
  const align = anchor.align ?? "left";
  const maxLeft = window.innerWidth - VIEWPORT_MARGIN - width;
  const left = align === "right" ? anchor.x - width : anchor.x;
  const spaceBelow = window.innerHeight - VIEWPORT_MARGIN - anchor.y;
  const spaceAbove = anchor.y - VIEWPORT_MARGIN;
  const flipped = height > spaceBelow && spaceAbove >= height;
  const top = flipped ? anchor.y - height : anchor.y;
  return {
    left: Math.max(VIEWPORT_MARGIN, Math.min(left, maxLeft)),
    top: Math.max(VIEWPORT_MARGIN, Math.min(top, window.innerHeight - VIEWPORT_MARGIN - height)),
    flipped,
  };
}

export function MenuProvider({ children }: { children: ReactNode }) {
  const [request, setRequest] = useState<MenuRequest | null>(null);
  const [focusIndex, setFocusIndex] = useState(-1);
  const [measured, setMeasured] = useState<(MenuPlacement & { request: MenuRequest }) | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const close = useCallback(() => {
    setRequest(null);
    setFocusIndex(-1);
  }, []);

  const open = useCallback((req: MenuRequest) => {
    setRequest(req);
    setFocusIndex(-1);
  }, []);

  const estimated = useMemo(() => {
    if (!request) return null;
    const width = request.anchor.width ?? DEFAULT_WIDTH;
    const height = Math.min(
      request.items.length * ITEM_HEIGHT +
        request.items.filter((item) => !item.label).length * SEPARATOR_HEIGHT +
        SURFACE_PADDING,
      MAX_SURFACE_HEIGHT,
      window.innerHeight - VIEWPORT_MARGIN * 2,
    );
    return { ...placeMenu(request.anchor, width, height), width };
  }, [request]);

  useLayoutEffect(() => {
    const el = menuRef.current;
    if (!el || !request) return;
    const next = placeMenu(request.anchor, el.offsetWidth, el.offsetHeight);
    setMeasured((prev) =>
      prev && prev.request === request && prev.left === next.left && prev.top === next.top && prev.flipped === next.flipped
        ? prev
        : { ...next, request },
    );
  }, [request]);

  useEffect(() => {
    if (!request) return;
    const onDown = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) close();
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        close();
      } else if (event.key === "ArrowDown") {
        event.preventDefault();
        setFocusIndex((current) => nextEnabledIndex(request.items, current, 1));
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        setFocusIndex((current) => nextEnabledIndex(request.items, current, -1));
      } else if (event.key === "Enter" || event.key === " ") {
        const item = request.items[focusIndex];
        if (item && !item.disabled && item.onSelect) {
          event.preventDefault();
          close();
          item.onSelect();
        }
      }
    };
    const onResize = () => close();
    const onWheel = (event: WheelEvent) => {
      if (menuRef.current && event.target instanceof Node && menuRef.current.contains(event.target)) return;
      close();
    };
    window.addEventListener("mousedown", onDown, true);
    window.addEventListener("keydown", onKey, true);
    window.addEventListener("resize", onResize);
    window.addEventListener("wheel", onWheel, true);
    return () => {
      window.removeEventListener("mousedown", onDown, true);
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("wheel", onWheel, true);
    };
  }, [request, focusIndex, close]);

  useEffect(() => {
    if (focusIndex < 0) return;
    const item = menuRef.current?.querySelector<HTMLElement>(`[data-index="${focusIndex}"]`);
    item?.scrollIntoView({ block: "nearest" });
  }, [focusIndex]);

  const position = request ? (measured && measured.request === request ? measured : estimated) : null;

  const value = useMemo<MenuContextValue>(() => ({ open, close, isOpen: !!request }), [open, close, request]);

  return (
    <MenuContext.Provider value={value}>
      {children}
      {request && position && (
        <div
          className="menu-surface"
          data-flip={position.flipped}
          style={{ left: position.left, top: position.top, width: estimated?.width ?? request.anchor.width ?? DEFAULT_WIDTH }}
          ref={menuRef}
          role="menu"
        >
          {request.items.map((item, index) =>
            item.label ? (
              <button
                key={item.id}
                type="button"
                role="menuitem"
                className="menu-item"
                data-index={index}
                data-danger={item.danger}
                data-focused={focusIndex === index}
                disabled={item.disabled}
                onMouseEnter={() => setFocusIndex(index)}
                onClick={() => {
                  if (item.disabled) return;
                  close();
                  item.onSelect?.();
                }}
              >
                {item.separatorBefore && <span className="menu-item-separator" aria-hidden="true" />}
                {item.icon && (
                  <span className="menu-item-icon">
                    <Icon name={item.icon} size={16} />
                  </span>
                )}
                <span className="menu-item-label">{item.label}</span>
                {item.shortcut && <span className="menu-item-shortcut">{item.shortcut}</span>}
                {item.checked && (
                  <span className="menu-item-check">
                    <Icon name="check" size={14} />
                  </span>
                )}
              </button>
            ) : (
              <div key={item.id} className="menu-separator" role="separator" />
            ),
          )}
        </div>
      )}
    </MenuContext.Provider>
  );
}

export function useMenu(): MenuContextValue {
  const ctx = useContext(MenuContext);
  if (!ctx) throw new Error("useMenu must be used inside MenuProvider");
  return ctx;
}
