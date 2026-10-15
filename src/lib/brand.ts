export const RED = "#D7263D";
export const HOUSE_POINTS = "50,18.5 80,45.4 80,82 20,82 20,45.4";
export const DOOR = { x: 42.5, y: 58.5, width: 15, height: 24.5 };

const house = (wall: string, door: string) =>
  `<polygon points="${HOUSE_POINTS}" fill="${wall}"/><rect x="${DOOR.x}" y="${DOOR.y}" width="${DOOR.width}" height="${DOOR.height}" fill="${door}"/>`;

export const markSvg = () =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="50" cy="50" r="50" fill="${RED}"/>${house("#fff", RED)}</svg>`;

export const appIconSvg = () =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" rx="22" fill="${RED}"/><circle cx="50" cy="50" r="33" fill="#fff"/><g transform="translate(50 50) scale(0.6) translate(-50 -50)">${house(RED, "#fff")}</g></svg>`;

export const ogSvg = () =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 630"><rect width="1200" height="630" fill="${RED}"/><circle cx="600" cy="315" r="190" fill="#fff"/><g transform="translate(600 315) scale(3.4) translate(-50 -50)">${house(RED, "#fff")}</g></svg>`;
