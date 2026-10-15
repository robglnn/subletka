export type Rankable = { building: string; kind: string; group: number };

export const FIRST_SCREEN = { size: 6, run: 3 };

const sameTail = <T>(xs: T[], n: number, of: (x: T) => string) => {
  const tail = xs.slice(-n);
  return tail.length === n && tail.every((x) => of(x) === of(tail[0])) ? of(tail[0]) : null;
};

export function diversify<T extends Rankable>(ordered: T[], run: number, screen = FIRST_SCREEN): T[] {
  const left = [...ordered];
  const out: T[] = [];
  while (left.length) {
    const group = left[0].group;
    const building = sameTail(out, run, (x) => x.building);
    const kind = out.length < screen.size ? sameTail(out, screen.run, (x) => x.kind) : null;
    const fits = (x: T, mixKinds: boolean) => x.group === group && x.building !== building && (!mixKinds || x.kind !== kind);
    const next = [left.findIndex((x) => fits(x, true)), left.findIndex((x) => fits(x, false)), 0].find((i) => i >= 0)!;
    out.push(left.splice(next, 1)[0]);
  }
  return out;
}
