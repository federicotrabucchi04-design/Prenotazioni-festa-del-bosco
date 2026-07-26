import type { Reservation, ZoneLayout } from "@/lib/types";
import type { ZonePlacement } from "@/lib/cartina";
import {
  formatTableGuests,
  guestsByTable,
  sortedTables,
  tableGridColumns,
} from "@/lib/cartina";

function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  maxLines: number,
): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width <= maxWidth) {
      line = test;
    } else {
      if (line) lines.push(line);
      line = word;
      if (lines.length >= maxLines) break;
    }
  }
  if (line && lines.length < maxLines) lines.push(line);
  if (lines.length === maxLines && words.join(" ").length > lines.join(" ").length) {
    const last = lines[maxLines - 1]!;
    lines[maxLines - 1] = `${last.replace(/\s+\S*$/, "")}…`.replace(/^…$/, "…");
  }
  return lines;
}

function drawZoneBlock(
  ctx: CanvasRenderingContext2D,
  zone: ZoneLayout,
  reservations: Reservation[],
  x: number,
  y: number,
  w: number,
  h: number,
) {
  ctx.strokeStyle = "#2d5a27";
  ctx.lineWidth = 3;
  ctx.strokeRect(x, y, w, h);
  ctx.fillStyle = "#e2efe1";
  ctx.fillRect(x, y, w, 52);
  ctx.fillStyle = "#2d5a27";
  ctx.font = "bold 28px system-ui, sans-serif";
  ctx.fillText(zone.name, x + 16, y + 36);

  const tables = sortedTables(zone);
  const guests = guestsByTable(reservations, zone.name);
  const tCols = tableGridColumns(tables.length);
  const tRows = Math.max(1, Math.ceil(tables.length / tCols));
  const innerX = x + 10;
  const innerY = y + 62;
  const innerW = w - 20;
  const innerH = h - 72;
  const tw = innerW / tCols;
  const th = innerH / tRows;

  tables.forEach((table, ti) => {
    const tc = ti % tCols;
    const tr = Math.floor(ti / tCols);
    const tx = innerX + tc * tw;
    const ty = innerY + tr * th;
    const tableGuests = guests.get(table.number) ?? [];
    const occupied = tableGuests.length > 0;

    ctx.fillStyle = occupied ? "#f7faf7" : "#ffffff";
    ctx.fillRect(tx + 3, ty + 3, tw - 6, th - 6);
    ctx.strokeStyle = occupied ? "#2d5a27" : "#c5d4c6";
    ctx.lineWidth = occupied ? 2.5 : 1.5;
    ctx.strokeRect(tx + 3, ty + 3, tw - 6, th - 6);

    if (!occupied) return;

    const label = formatTableGuests(tableGuests);
    const fontSize = Math.max(12, Math.min(26, Math.floor(Math.min(tw, th) / 4.5)));
    ctx.fillStyle = "#142418";
    ctx.font = `bold ${fontSize}px system-ui, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const maxW = tw - 16;
    const lines = wrapText(
      ctx,
      label,
      maxW,
      Math.max(1, Math.floor((th - 12) / (fontSize * 1.15))),
    );
    const blockH = lines.length * fontSize * 1.15;
    const startY = ty + th / 2 - blockH / 2 + fontSize / 2;
    lines.forEach((line, li) => {
      ctx.fillText(line, tx + tw / 2, startY + li * fontSize * 1.15);
    });
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
  });
}

/** Genera e scarica PNG della cartina globale (A4 landscape). */
export function downloadCartinaPng(opts: {
  items: { zone: ZoneLayout; placement: ZonePlacement }[];
  gridRows: number;
  gridCols: number;
  reservations: Reservation[];
  title: string;
  subtitle: string;
  filename?: string;
}) {
  const { items, gridRows, gridCols, reservations, title, subtitle } = opts;
  const W = 3508;
  const H = 2480;
  const pad = 48;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, W, H);

  ctx.fillStyle = "#142418";
  ctx.font = "bold 56px system-ui, sans-serif";
  ctx.fillText(title, pad, pad + 48);
  ctx.font = "36px system-ui, sans-serif";
  ctx.fillStyle = "#5a7260";
  ctx.fillText(subtitle, pad, pad + 100);

  const headerH = 130;
  const gap = 28;
  const areaX = pad;
  const areaY = pad + headerH;
  const areaW = W - pad * 2;
  const areaH = H - pad * 2 - headerH - 40;
  const cols = Math.max(1, gridCols);
  const rows = Math.max(1, gridRows);
  const cellW = (areaW - gap * (cols - 1)) / cols;
  const cellH = (areaH - gap * (rows - 1)) / rows;

  for (const { zone, placement } of items) {
    const x = areaX + placement.col * (cellW + gap);
    const y = areaY + placement.row * (cellH + gap);
    const w = cellW * placement.colSpan + gap * (placement.colSpan - 1);
    const h = cellH * placement.rowSpan + gap * (placement.rowSpan - 1);
    drawZoneBlock(ctx, zone, reservations, x, y, w, h);
  }

  ctx.fillStyle = "#5a7260";
  ctx.font = "22px system-ui, sans-serif";
  ctx.fillText(
    "Nome (persone) sui tavoli occupati · Feste del Bosco",
    pad,
    H - 24,
  );

  const link = document.createElement("a");
  link.download =
    opts.filename ??
    `cartina-feste-del-bosco-${new Date().toISOString().slice(0, 10)}.png`;
  link.href = canvas.toDataURL("image/png");
  link.click();
}
