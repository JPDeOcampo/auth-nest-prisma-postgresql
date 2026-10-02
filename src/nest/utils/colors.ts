const toHex = (n: number): string => n.toString(16).padStart(2, "0");

const randomChannel = (): number => Math.floor(Math.random() * 127 + 127);

export const randomColorHex = (): string => {
  const r = randomChannel();
  const g = randomChannel();
  const b = randomChannel();

  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
};
