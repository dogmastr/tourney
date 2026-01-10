import { type Tournament } from "./model";

export function getTitleColor(tournament: Tournament, title: string | undefined): string | null {
  if (!title) return null;

  // Check if it's a custom title
  const customTitle = tournament.customTitles?.find(t => t.name === title);
  if (customTitle) {
    return customTitle.color;
  }

  return null;
}

export function getTitleStyle(
  tournament: Tournament,
  title: string | undefined
): { backgroundColor: string; borderColor: string; color: string } | undefined {
  const color = getTitleColor(tournament, title);
  if (!color) return undefined;

  return {
    backgroundColor: `${color}20`,
    borderColor: `${color}50`,
    color: color,
  };
}

export function getTitlesStyles(
  tournament: Tournament,
  titles: string[] | undefined
): Array<{ title: string; style: { backgroundColor: string; borderColor: string; color: string } | undefined }> {
  if (!titles || titles.length === 0) return [];

  return titles.map(title => ({
    title,
    style: getTitleStyle(tournament, title),
  }));
}

export function getAllTitles(tournament: Tournament): Array<{ name: string; isCustom: boolean }> {
  const standardTitles = [
    // Open titles
    "GM", "IM", "FM", "CM", "NM",
    // Women's titles
    "WGM", "WIM", "WFM", "WCM", "WNM",
    // Arena titles
    "AGM", "AIM", "AFM", "ACM",
  ];
  const customTitles = tournament.customTitles || [];

  return [
    ...standardTitles.map(name => ({ name, isCustom: false })),
    ...customTitles.map(t => ({ name: t.name, isCustom: true })),
  ];
}

