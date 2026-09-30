export const findVersesInBetween = (startStr: string, endStr: string): number[] => {
  const foundVerses: number[] = [];

  const start = Number(startStr);
  const end = Number(endStr);

  for (let current = start; current <= end; current++)
    foundVerses.push(current);

  return foundVerses
}