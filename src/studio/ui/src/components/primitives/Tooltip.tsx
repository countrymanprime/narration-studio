import { Popover } from '@base-ui/react/popover';
import { Tooltip as BaseTooltip } from '@base-ui/react/tooltip';
import {
  isValidElement,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type FocusEvent as ReactFocusEvent,
  type ReactNode,
  type SyntheticEvent,
} from 'react';
import { flushSync } from 'react-dom';
import { HINT_POPUP_ATTRIBUTE, HINT_POPUP_CLASSES } from './hintLayer';
import { lastInputWasKeyboard } from './inputModality';
import { HIT_AREA } from './hitArea';

// A hint waits for the pointer to rest for a second (keyboard focus shows it at once). It stays while it is hovered or
// focused, does not move when the pointer travels onto it, and Escape dismisses it, which is what WCAG 1.4.13 asks of
// content that appears on hover or focus.
const HOVER_DELAY_MS = 1000;

// The popup sits 5 px clear of its target when it is above it and 13 px when it flipped below, within a pixel of where the
// previous hand-placed tooltip ended up. Base UI measures the popup, so it flips on its own.
const hintOffset = ({ side }: { side: string }): number => (side === 'top' ? 5 : 13);

// The provider stays as the one place the app and Storybook mount for tooltips, but it adds no Base UI provider: the
// library's provider groups neighbouring tooltips so the next one opens at once while another is showing, and every hint
// here waits its own second (each trigger carries the delay itself).
export function TooltipProvider({ children }: { children: ReactNode }) {
  return <>{children}</>;
}

// What Base UI's trigger hands to the element it renders: event handlers, `ref`, and attributes (`id`, `aria-describedby`,
// `data-popup-open`, ...). `TriggerBridge` passes them on to the wrapper `TooltipTarget` draws itself.
type TriggerProps = Record<string, unknown> & { ref?: unknown };

const NOT_ATTRIBUTES = new Set(['ref', 'key', 'children', 'className', 'style']);

function isHandler(name: string, value: unknown): value is (event: SyntheticEvent) => void {
  return typeof value === 'function' && /^on[A-Z]/.test(name);
}

// The handler names and the attributes of a trigger's props, as a value that is equal while they are (the handlers' identities
// change on every render of the trigger, so they are looked up through `latest` when an event arrives).
function splitTriggerProps(props: TriggerProps): { handlers: string[]; attributes: Record<string, unknown> } {
  const handlers: string[] = [];
  const attributes: Record<string, unknown> = {};
  for (const [name, value] of Object.entries(props)) {
    if (NOT_ATTRIBUTES.has(name)) continue;
    if (isHandler(name, value)) handlers.push(name);
    else if (typeof value !== 'function') attributes[name] = value;
  }
  return { handlers, attributes };
}

function assignRef(ref: unknown, element: HTMLElement | null) {
  if (typeof ref === 'function') ref(element);
  else if (ref && typeof ref === 'object') (ref as { current: HTMLElement | null }).current = element;
}

// React clears `currentTarget` once an event has been dispatched, and Base UI's handlers read it, so a replayed event is the
// original with the wrapper put back as its current target.
function replayable(event: SyntheticEvent, currentTarget: HTMLElement): SyntheticEvent {
  return Object.create(event, { currentTarget: { value: currentTarget } }) as SyntheticEvent;
}

// Renders nothing: it keeps the latest trigger props where the wrapper's event forwarders can read them, hands the wrapper to
// Base UI as the trigger element, and reports when the handler names or attributes changed so the wrapper draws them.
function TriggerBridge({
  props,
  host,
  latest,
  onProps,
}: {
  props: TriggerProps;
  host: { current: HTMLElement | null };
  latest: { current: TriggerProps };
  onProps: (split: { handlers: string[]; attributes: Record<string, unknown> }) => void;
}) {
  const ref = props.ref;
  useLayoutEffect(() => {
    const element = host.current;
    if (!element) return undefined;
    assignRef(ref, element);
    return () => assignRef(ref, null);
  }, [ref, host]);
  useLayoutEffect(() => {
    latest.current = props;
    onProps(splitTriggerProps(props));
  });
  return null;
}

type FirstContact = { kind: 'hover'; enter: ReactMouseEvent<HTMLElement> } | { kind: 'focus'; focus: ReactFocusEvent<HTMLElement> };

// A hint for a control that carries its own label: the tooltip is for sighted users (the library documents it that way),
// so the child must already have an accessible name. A disabled child cannot take focus or hover, so the wrapper becomes
// the tab stop and carries the reason as its name. `inline` is for a control inside running text (a read-aloud flag, a
// `<mark role="button">` that can wrap across lines): the trigger is then an inline box that flows with the line, where the
// default inline-flex box would pull the whole mark onto one line.
//
// The Base UI tooltip (its store, floating context and trigger hooks) costs about 0.2 ms to mount, and a page such as the
// Production table draws a few hundred hints, almost none of which is ever hovered (#3310). So the wrapper is a plain span until
// the pointer first rests on it or keyboard focus first reaches it, and only then does the library mount, as a sibling of the
// wrapper: the wrapper and its children are never replaced, so focus, state and a press in progress survive the switch. The
// library's trigger then hands its handlers and attributes to that same wrapper (`TriggerBridge`), and the event that caused
// the switch is replayed into it, so the delay starts on the first hover and keyboard focus shows the hint at once, exactly
// as if the library had been there from the start.
export function TooltipTarget({
  text,
  children,
  className = '',
  style,
  inline = false,
  hoverDelayMs = HOVER_DELAY_MS,
}: {
  text: string;
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
  inline?: boolean;
  /** How long the pointer rests before the hint opens (keyboard focus is always at once). Only for a control whose reason is its one cue, such as a locked rail item. */
  hoverDelayMs?: number;
}) {
  const disabledChild = isValidElement(children) && Boolean((children.props as { disabled?: boolean }).disabled);
  const host = useRef<HTMLSpanElement>(null);
  const latest = useRef<TriggerProps>({});
  const [armed, setArmed] = useState(false);
  const [bridged, setBridged] = useState<{ handlers: string[]; attributes: Record<string, unknown> }>({ handlers: [], attributes: {} });
  const signature = useRef('');
  const touched = useRef(false);
  const pendingFocus = useRef<ReactFocusEvent<HTMLElement> | null>(null);

  const onProps = useCallback((split: { handlers: string[]; attributes: Record<string, unknown> }) => {
    const next = JSON.stringify([split.handlers, split.attributes]);
    if (next === signature.current) return;
    signature.current = next;
    setBridged(split);
  }, []);

  // Mounts the library now, in this event, and replays the event into it.
  const call = (name: string, event: SyntheticEvent) => {
    const element = host.current;
    const handler = latest.current[name];
    if (element && typeof handler === 'function') handler(replayable(event, element));
  };

  const arm = (first: FirstContact) => {
    // A focus can arrive while React is committing (`autoFocus`, or `.focus()` in an effect), where `flushSync` cannot run, so
    // it is replayed from an effect once the library is in. A pointer event never arrives mid-commit: it mounts and replays here.
    if (first.kind === 'focus') {
      pendingFocus.current = first.focus;
      setArmed(true);
      return;
    }
    flushSync(() => setArmed(true));
    const element = host.current;
    if (!element) return;
    // The library learns the pointer type from the pointer event, starts its delay from `mouseenter` and its rest timer from
    // the first `mousemove`; the last two only exist as events on the element, so `mouseenter` is raised on it (it does not
    // bubble, so nothing else hears it).
    call('onPointerEnter', first.enter);
    element.dispatchEvent(new MouseEvent('mouseenter', { clientX: first.enter.clientX, clientY: first.enter.clientY }));
    call('onMouseMove', first.enter);
  };

  // Replays the focus that mounted the library. The library decides, as it would have from the start, whether the target is
  // still keyboard-focused (`:focus-visible`) and so shows the hint, so a focus that has moved on in the meantime shows nothing.
  useEffect(() => {
    const focus = pendingFocus.current;
    if (!armed || !focus || bridged.handlers.length === 0) return;
    pendingFocus.current = null;
    call('onFocus', focus);
  });

  const forwarded = useMemo(() => {
    const out: Record<string, (event: SyntheticEvent) => void> = {};
    for (const name of bridged.handlers) {
      out[name] = (event) => {
        const handler = latest.current[name];
        if (typeof handler === 'function') handler(event);
      };
    }
    return out;
  }, [bridged.handlers]);

  const lazyHandlers = armed
    ? {}
    : {
        onPointerEnter: (event: ReactPointerEvent<HTMLElement>) => {
          // A finger does not hover (the library ignores it for the delay), and the mouse events a touch emulates after it must
          // not start one either. A pen counts as a mouse there: some Linux Chromium builds report a mouse as a pen.
          touched.current = event.pointerType === 'touch';
          if (!touched.current) arm({ kind: 'hover', enter: event });
        },
        onMouseEnter: (event: ReactMouseEvent<HTMLElement>) => {
          if (!touched.current) arm({ kind: 'hover', enter: event });
        },
        onFocus: (event: ReactFocusEvent<HTMLElement>) => arm({ kind: 'focus', focus: event }),
      };

  return (
    <>
      <span
        ref={host}
        className={`${inline ? 'inline' : 'inline-flex'} ${className}`}
        style={style}
        {...bridged.attributes}
        {...lazyHandlers}
        {...forwarded}
        tabIndex={disabledChild ? 0 : undefined}
        role={disabledChild ? 'group' : undefined}
        aria-label={disabledChild ? text : undefined}
      >
        {children}
      </span>
      {armed && (
        <BaseTooltip.Root disabled={text === ''}>
          <BaseTooltip.Trigger
            delay={hoverDelayMs}
            render={(props) => <TriggerBridge props={props as TriggerProps} host={host} latest={latest} onProps={onProps} />}
          />
          <BaseTooltip.Portal>
            <BaseTooltip.Positioner side="top" sideOffset={hintOffset} collisionPadding={8} className="z-[var(--z-tooltip)]">
              <BaseTooltip.Popup role="tooltip" {...{ [HINT_POPUP_ATTRIBUTE]: '' }} className={HINT_POPUP_CLASSES}>
                {text}
              </BaseTooltip.Popup>
            </BaseTooltip.Positioner>
          </BaseTooltip.Portal>
        </BaseTooltip.Root>
      )}
    </>
  );
}

// The "i" next to a label. It is a real button, so the keyboard reaches it and a screen reader announces it, and its text
// is its accessible description (a hint that only appears on hover is invisible to a screen reader). Hover (after a
// second), keyboard focus and a press open the popup; Escape closes it. `label` names the icon when a page has more than one, so a screen
// reader can tell them apart ("About reference material"). `icon` swaps the "i" glyph for a different one (the manuscript
// controls bar's `faFont` "Text size" info button, R11) while keeping every other part of the contract identical.
export function Tooltip({ text, label = 'More information', icon = 'i' }: { text: string; label?: string; icon?: ReactNode }) {
  const [open, setOpen] = useState(false);
  const openedByFocus = useRef(false);
  const popupRef = useRef<HTMLDivElement>(null);
  // Escape closes the note wherever focus is (WCAG 1.4.13: dismissible without moving the pointer or focus). Base UI closes it from its own
  // handler, but inside a dialog that handler is not reached for a note opened by hover, so the icon listens itself while its note is open.
  useEffect(() => {
    if (!open) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      openedByFocus.current = false;
      setOpen(false);
    };
    document.addEventListener('keydown', closeOnEscape, true);
    return () => document.removeEventListener('keydown', closeOnEscape, true);
  }, [open]);
  return (
    <Popover.Root
      open={open}
      onOpenChange={(next, details) => {
        // Enter or Space on an icon that keyboard focus has just opened would close it again: keep it open, and let the
        // next press close it.
        if (!next && details.reason === 'trigger-press' && openedByFocus.current) {
          openedByFocus.current = false;
          details.cancel();
          return;
        }
        if (!next) openedByFocus.current = false;
        setOpen(next);
      }}
    >
      <Popover.Trigger
        openOnHover
        delay={HOVER_DELAY_MS}
        aria-label={label}
        aria-description={text}
        onFocus={() => {
          if (!lastInputWasKeyboard()) return;
          openedByFocus.current = true;
          setOpen(true);
        }}
        onBlur={(event) => {
          // Focus moving onto the popup itself (a press on its text) is not leaving.
          if (popupRef.current?.contains(event.relatedTarget as Node | null)) return;
          openedByFocus.current = false;
          setOpen(false);
        }}
        className={`ml-1 inline-flex size-[15px] cursor-help items-center justify-center rounded-full border border-[var(--non-text)] font-['IBM_Plex_Mono',monospace] text-[0.68rem] text-[var(--text-muted)] [text-transform:inherit] hover:border-[var(--accent)] hover:text-[var(--accent)] ${HIT_AREA}`}
      >
        {icon}
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner side="top" sideOffset={hintOffset} collisionPadding={8} className="z-[var(--z-tooltip)]">
          {/* The text is a description, not something to move into: focus stays on the button. */}
          <Popover.Popup
            ref={popupRef}
            role="tooltip"
            initialFocus={false}
            finalFocus={false}
            {...{ [HINT_POPUP_ATTRIBUTE]: '' }}
            className={HINT_POPUP_CLASSES}
          >
            {text}
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}
