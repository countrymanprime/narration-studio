// A selector that derives from slices keeps its result's identity until one of its inputs changes, so a component that
// reads a derived value through `useStudio` re-renders only when the data behind it did (the mock's stable-slice rule).
// Composition is passing a selector built here as an input of another. This file imports nothing: selectors are pure
// functions of a state and import types and other selectors only.

type AnySelector = (state: never) => unknown;

export function createSelector<const Inputs extends readonly AnySelector[], R>(
  inputs: Inputs,
  combine: (...values: { [K in keyof Inputs]: Inputs[K] extends (state: never) => infer V ? V : never }) => R,
): (state: Parameters<Inputs[number]>[0]) => R {
  let last: { values: unknown[]; result: R } | undefined;
  return (state) => {
    const values = inputs.map((input) => input(state as never));
    if (last && values.every((v, i) => Object.is(v, last!.values[i]))) return last.result;
    const result = (combine as (...args: unknown[]) => R)(...values);
    last = { values, result };
    return result;
  };
}
