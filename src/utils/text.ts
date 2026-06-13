export const normalizeText = (value: unknown): string => {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();
};

export const includesNormalized = (value: unknown, search: string): boolean => {
  return normalizeText(value).includes(normalizeText(search));
};
