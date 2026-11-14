import {KeyValueStore} from '../storage/keyValueStore';
import {ToolType} from './tapDetector';

/** What may open an s-INK link with a tap: the finger, the pen, or both. */
export type LinkTrigger = 'finger' | 'pen' | 'both';

export const LINK_TRIGGERS: readonly LinkTrigger[] = ['finger', 'pen', 'both'];

/** The finger only: a pen tap leaves a dot in the note. */
export const DEFAULT_LINK_TRIGGER: LinkTrigger = 'finger';

/** Storage key of the link trigger setting. */
export const LINK_TRIGGER_KEY = 'supertrello.inkLink.trigger';

/**
 * Whether a tap made with a tool opens links. An unknown tool (0) counts
 * as a finger.
 */
export function acceptsTool(trigger: LinkTrigger, toolType: number): boolean {
  const pen = toolType === ToolType.Pen;
  return trigger === 'both' || (trigger === 'pen' ? pen : !pen);
}

export async function loadLinkTrigger(
  store: KeyValueStore,
): Promise<LinkTrigger> {
  try {
    const raw = await store.getItem(LINK_TRIGGER_KEY);
    return LINK_TRIGGERS.find(value => value === raw) ?? DEFAULT_LINK_TRIGGER;
  } catch (error) {
    console.warn('[sINK] Failed to read the link trigger', error);
    return DEFAULT_LINK_TRIGGER;
  }
}

export async function saveLinkTrigger(
  store: KeyValueStore,
  trigger: LinkTrigger,
): Promise<void> {
  try {
    await store.setItem(LINK_TRIGGER_KEY, trigger);
  } catch (error) {
    console.warn('[sINK] Failed to save the link trigger', error);
  }
}

let current: LinkTrigger = DEFAULT_LINK_TRIGGER;

/** The trigger used by the tap listener, which runs outside React. */
export function getLinkTrigger(): LinkTrigger {
  return current;
}

export function setLinkTrigger(trigger: LinkTrigger): void {
  current = trigger;
}
