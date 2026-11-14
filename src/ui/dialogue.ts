/**
 * Dialogue box: speaker portrait (coloured disc — the 3D character is in the scene), typewriter text with
 * an `onChar` callback for the synthesised voice, click/Space to advance, multiple choices and highlighted
 * Thai words. Markup inside `text`:  {{sawasdee|ciao}}  → "sawasdee (ciao)" with the Thai word highlighted.
 * With `subtitles: false` the box shrinks to the speaker name and a "talking" indicator (choices stay).
 */
import './styles/tokens.css';
import './styles/base.css';
import './styles/dialogue.css';
import { t } from '../core/i18n';
import { cx, h } from './dom';
import type { IconName } from './icons';
import { icon } from './icons';
import { sfx } from './sound';
import type { Mounted } from './view';
import { avatar, kbd } from './widgets';

export interface DialogueChoice {
  id: string;
  label: string;
  icon?: IconName | string;
  /** small grey note after the label ("−฿ 200", "salta il tutorial") */
  hint?: string;
}

export interface DialogueProps {
  speaker: { name: string; role?: string; color?: string; icon?: IconName | string };
  text: string;
  choices?: DialogueChoice[];
  /** false = reduced box without the text (accessibility setting "sottotitoli") */
  subtitles?: boolean;
  /** characters per second (default 42) */
  speed?: number;
  /** "2 / 5" */
  progress?: string;
}

export interface DialogueCallbacks {
  /** player clicked / pressed Space after the line finished (never fired while choices are shown) */
  onAdvance(): void;
  onChoice?(id: string): void;
  /** every revealed character (skip whitespace yourself if needed) — drive the voice blips here */
  onChar?(char: string, index: number): void;
  onLineDone?(): void;
}

export interface DialogueHandle extends Mounted<DialogueProps> {
  /** reveal the whole line at once */
  skip(): void;
  readonly typing: boolean;
}

export interface TextSegment {
  text: string;
  kind: 'plain' | 'thai' | 'gloss';
}

/** Parse the `{{thai|translation}}` markup into segments (pure, unit-tested). */
export function parseDialogueText(text: string): TextSegment[] {
  const out: TextSegment[] = [];
  const re = /\{\{([^|}]+)(?:\|([^}]*))?\}\}/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push({ text: text.slice(last, m.index), kind: 'plain' });
    out.push({ text: m[1] as string, kind: 'thai' });
    if (m[2]) out.push({ text: ` (${m[2]})`, kind: 'gloss' });
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push({ text: text.slice(last), kind: 'plain' });
  return out;
}

export function mountDialogue(parent: HTMLElement, initial: DialogueProps, cb: DialogueCallbacks): DialogueHandle {
  let props = initial;
  let destroyed = false;
  let raf = 0;
  let shown = 0;
  let total = 0;
  let typing = false;
  let chars: string[] = [];
  let spans: Array<{ on: HTMLElement; off: HTMLElement; start: number; text: string[] }> = [];

  const nameEl = h('div', { class: 'dlg-name' });
  const roleEl = h('div', { class: 'dlg-role' });
  const portrait = h('div', { class: 'dlg-portrait' });
  const textEl = h('p', { class: 'dlg-text' });
  const talk = h('div', { class: 'dlg-talk' }, h('i'), h('i'), h('i'));
  const choicesEl = h('div', { class: 'dlg-choices' });
  const progressEl = h('span', { class: 'dlg-progress num' });
  const nextEl = h('div', { class: 'dlg-next' }, progressEl, h('span', { class: 'dlg-next-label' }), kbd('Space'), icon('chevron_right'));
  const box = h('div', { class: 'dlg-box panel' }, h('div', { class: 'dlg-plate wood' }, nameEl, roleEl), textEl, talk, nextEl);
  const el = h('div', { class: 'dlg pe', role: 'dialog' }, choicesEl, h('div', { class: 'dlg-row' }, portrait, box));
  el.dataset.view = 'dialogue';

  const paint = (): void => {
    for (const s of spans) {
      const n = Math.max(0, Math.min(s.text.length, shown - s.start));
      s.on.textContent = s.text.slice(0, n).join('');
      s.off.textContent = s.text.slice(n).join('');
    }
  };

  const finish = (): void => {
    if (!typing) return;
    typing = false;
    cancelAnimationFrame(raf);
    shown = total;
    paint();
    el.classList.remove('is-typing');
    el.classList.add('is-done');
    cb.onLineDone?.();
  };

  const start = (): void => {
    cancelAnimationFrame(raf);
    const subs = props.subtitles !== false;
    el.classList.toggle('is-compact', !subs);
    el.classList.toggle('has-choices', Boolean(props.choices?.length));
    nameEl.textContent = props.speaker.name;
    roleEl.textContent = props.speaker.role ?? '';
    portrait.replaceChildren(avatar({ name: props.speaker.name, color: props.speaker.color, icon: props.speaker.icon, size: 'xl' }));
    progressEl.textContent = props.progress ?? '';
    (nextEl.querySelector('.dlg-next-label') as HTMLElement).textContent = t('ui.dialogue.next');
    textEl.replaceChildren();
    spans = [];
    chars = [];
    for (const seg of parseDialogueText(props.text)) {
      const on = h('span', { class: seg.kind === 'thai' ? 'thai' : seg.kind === 'gloss' ? 'thai-gloss' : '' });
      const off = h('span', { class: cx('dlg-ghost', seg.kind === 'thai' && 'thai') });
      const list = Array.from(seg.text);
      spans.push({ on, off, start: chars.length, text: list });
      chars.push(...list);
      textEl.append(on, off);
    }
    total = chars.length;
    shown = 0;
    choicesEl.replaceChildren(
      ...(props.choices ?? []).map((c, i) =>
        h(
          'button',
          {
            type: 'button',
            class: 'dlg-choice pe',
            style: { '--i': i },
            dataset: { hover: '' },
            onClick: (ev: Event) => {
              ev.stopPropagation();
              sfx('ui_click');
              cb.onChoice?.(c.id);
            },
          },
          h('span', { class: 'dlg-choice-key' }, i + 1),
          c.icon ? icon(c.icon) : null,
          h('span', { class: 'grow' }, c.label),
          c.hint ? h('span', { class: 'dlg-choice-hint' }, c.hint) : null,
        ),
      ),
    );
    typing = true;
    el.classList.add('is-typing');
    el.classList.remove('is-done');
    paint();
    if (document.documentElement.classList.contains('reduce-motion') && subs) {
      for (let i = 0; i < total; i++) cb.onChar?.(chars[i] as string, i);
      finish();
      return;
    }
    const speed = props.speed ?? 42;
    let acc = 0;
    let lastT = performance.now();
    const tick = (now: number): void => {
      if (destroyed || !typing) return;
      acc += ((now - lastT) / 1000) * speed;
      lastT = now;
      let changed = false;
      while (acc >= 1 && shown < total) {
        const ch = chars[shown] as string;
        cb.onChar?.(ch, shown);
        shown++;
        changed = true;
        // natural pauses on punctuation
        acc -= ch === '.' || ch === '!' || ch === '?' ? 9 : ch === ',' || ch === ';' || ch === ':' ? 4 : 1;
      }
      if (changed) paint();
      if (shown >= total) finish();
      else raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
  };

  const advance = (): void => {
    if (typing) {
      finish();
      return;
    }
    if (props.choices?.length) return;
    sfx('ui_click');
    cb.onAdvance();
  };
  const onKey = (ev: KeyboardEvent): void => {
    if (ev.repeat || (ev.target instanceof HTMLElement && ev.target.matches('input, textarea'))) return;
    if (ev.code === 'Space' || ev.code === 'Enter') {
      ev.preventDefault();
      advance();
    } else if (!typing && props.choices?.length && /^Digit[1-9]$/.test(ev.code)) {
      const c = props.choices[Number(ev.code.slice(5)) - 1];
      if (c) {
        ev.preventDefault();
        ev.stopPropagation();
        sfx('ui_click');
        cb.onChoice?.(c.id);
      }
    }
  };
  el.addEventListener('click', advance);
  window.addEventListener('keydown', onKey, true);
  parent.appendChild(el);
  start();

  return {
    get el() {
      return el;
    },
    get typing() {
      return typing;
    },
    update(next) {
      const same = next.text === props.text && next.speaker.name === props.speaker.name && next.subtitles === props.subtitles;
      props = next;
      if (same) return;
      start();
    },
    skip: finish,
    destroy(immediate) {
      if (destroyed) return;
      destroyed = true;
      cancelAnimationFrame(raf);
      window.removeEventListener('keydown', onKey, true);
      if (immediate) el.remove();
      else {
        el.classList.add('is-leaving');
        window.setTimeout(() => el.remove(), 180);
      }
    },
  };
}
