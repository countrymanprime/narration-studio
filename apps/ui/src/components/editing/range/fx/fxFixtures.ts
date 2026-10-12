import type { DawCapabilities } from '../../../../api/contracts/daw';
import type { EditWordFxApi, WordFx, WordFxRequest } from '../../../../api/contracts/wordFx';
import type { FxChainsPort } from '../../../../ports/fxchains';

/** An in-memory Editing records log for the word effects: records what it is sent, in time order, and forgets by id. */
export function fakeFxLog(): Pick<EditWordFxApi, 'editingWordFxList' | 'editingWordFxRecord' | 'editingWordFxRemove'> & {
  effects: WordFx[];
  recorded: WordFxRequest[];
} {
  const self = {
    effects: [] as WordFx[],
    recorded: [] as WordFxRequest[],
    next: 0,
    change(chapterId: string, changed: string[], over: string[] = []) {
      self.effects.sort((x, y) => x.a - y.a);
      return Promise.resolve({ chapterId, effects: self.effects.map((f) => ({ ...f })), changed, over });
    },
    editingWordFxList: (chapterId: string) => Promise.resolve({ chapterId, effects: self.effects.map((f) => ({ ...f })) }),
    editingWordFxRecord(chapterId: string, fx: WordFxRequest) {
      const id = `fx${++self.next}`;
      const over = self.effects.filter((f) => f.keys.some((k) => fx.keys.includes(k))).map((f) => f.id);
      self.recorded.push(fx);
      self.effects.push({ ...fx, id, chapterId, words: fx.keys.map(() => ''), at: '2026-10-12T00:00:00Z', paragraph: 0, stale: false });
      return self.change(chapterId, [id], over);
    },
    editingWordFxRemove(chapterId: string, id: string) {
      self.effects = self.effects.filter((f) => f.id !== id);
      return self.change(chapterId, [id]);
    },
  };
  return self;
}

/** A DAW's declaration with Add FX switched on in a mode: `native` (REAPER), `steps` (Audacity: select, then apply) or `app` (the recorder keeps an entry). */
export function withFxRange(setup: DawCapabilities, mode: 'native' | 'steps' | 'app'): DawCapabilities {
  return {
    ...setup,
    capabilities: { ...setup.capabilities, fx_range: { level: 'experimental', available: true, mode }, fx_chains: { level: 'experimental', available: true } },
  };
}

/** A list under a source, whichever DAW it is for: the screens never name a chain, so a different list changes the menu and nothing else. */
export function listOf(source: string, names: readonly string[]): FxChainsPort {
  return { list: () => Promise.resolve({ source, choices: names.map((name) => ({ id: name, name })) }) };
}
