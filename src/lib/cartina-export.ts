import type { MapMark, Reservation, ZoneLayout } from "@/lib/types";
import type { ZoneOnBoard } from "@/lib/cartina";
import {
  computeTableFillRects,
  formatTableGuests,
  gapsFromPlacement,
  guestsByTable,
  zoneAccentColor,
  zoneFlipForPlacement,
  zoneKeepsTextUpright,
  markRotationDeg,
  zoneRotationDeg,
} from "@/lib/cartina";
import { withoutIngressoMarks } from "@/lib/layout-utils";

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

function applyZoneContentTransform(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  placement?: ZoneOnBoard,
) {
  const deg = zoneRotationDeg(placement);
  const { flipX, flipY } = zoneFlipForPlacement(placement);
  if (!deg && !flipX && !flipY) return;
  const cx = x + w / 2;
  const cy = y + h / 2;
  ctx.translate(cx, cy);
  if (deg) ctx.rotate((deg * Math.PI) / 180);
  if (flipX || flipY) ctx.scale(flipX ? -1 : 1, flipY ? -1 : 1);
  ctx.translate(-cx, -cy);
}

function drawUprightInZone(
  ctx: CanvasRenderingContext2D,
  px: number,
  py: number,
  placement: ZoneOnBoard | undefined,
  draw: () => void,
) {
  const deg = zoneRotationDeg(placement);
  const { flipX, flipY } = zoneFlipForPlacement(placement);
  if (!deg && !flipX && !flipY) {
    draw();
    return;
  }
  if (!zoneKeepsTextUpright(placement)) {
    draw();
    return;
  }
  ctx.save();
  ctx.translate(px, py);
  if (deg) ctx.rotate((-deg * Math.PI) / 180);
  if (flipX || flipY) ctx.scale(flipX ? -1 : 1, flipY ? -1 : 1);
  ctx.translate(-px, -py);
  draw();
  ctx.restore();
}

function drawZoneBlock(
  ctx: CanvasRenderingContext2D,
  zone: ZoneLayout,
  reservations: Reservation[],
  x: number,
  y: number,
  w: number,
  h: number,
  placement?: ZoneOnBoard,
) {
  const accent = zoneAccentColor(zone);
  const hideTitle = placement?.hideTitle === true;
  const hideBorder = placement?.hideBorder === true;
  const headerH = hideTitle ? 0 : Math.min(48, h * 0.14);

  if (!hideBorder) {
    ctx.strokeStyle = accent;
    ctx.lineWidth = 3;
    ctx.strokeRect(x, y, w, h);
  }

  ctx.save();
  applyZoneContentTransform(ctx, x, y, w, h, placement);

  if (!hideTitle) {
    ctx.fillStyle = accent;
    ctx.fillRect(x, y, w, headerH);
    drawUprightInZone(ctx, x + w / 2, y + Math.min(32, headerH * 0.72), placement, () => {
      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 26px system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(zone.name, x + w / 2, y + Math.min(32, headerH * 0.72));
      ctx.textAlign = "left";
      ctx.textBaseline = "alphabetic";
    });
  }

  const contentX = x;
  const contentY = y + headerH;
  const contentW = w;
  const contentH = Math.max(1, h - headerH);

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(contentX, contentY, contentW, contentH);

  drawMarks(ctx, withoutIngressoMarks(zone.marks), contentX, contentY, contentW, contentH, placement);

  const guests = guestsByTable(reservations, zone.name);
  const { gapX, gapY } = gapsFromPlacement(placement);
  const rects = computeTableFillRects(zone.tables, gapX, gapY);
  for (const { table, x: rx, y: ry, w: rw, h: rh } of rects) {
    const tx = contentX + (rx / 100) * contentW;
    const ty = contentY + (ry / 100) * contentH;
    const tw = (rw / 100) * contentW;
    const th = (rh / 100) * contentH;
    const tableGuests = guests.get(table.number) ?? [];
    const occupied = tableGuests.length > 0;

    ctx.fillStyle = occupied ? `${accent}22` : "#ffffff";
    ctx.fillRect(tx, ty, tw, th);
    ctx.strokeStyle = occupied ? accent : `${accent}66`;
    ctx.lineWidth = occupied ? 2 : 1.2;
    ctx.strokeRect(tx, ty, tw, th);

    if (!occupied) {
      drawUprightInZone(ctx, tx + tw - 6, ty + 4, placement, () => {
        ctx.fillStyle = `${accent}55`;
        ctx.font = "bold 14px system-ui, sans-serif";
        ctx.textAlign = "right";
        ctx.textBaseline = "top";
        ctx.fillText(String(table.number), tx + tw - 6, ty + 4);
        ctx.textAlign = "left";
        ctx.textBaseline = "alphabetic";
      });
      continue;
    }

    const label = formatTableGuests(tableGuests);
    const fontSize = Math.max(11, Math.min(24, Math.floor(Math.min(tw, th) / 4.5)));
    const lines = wrapText(
      ctx,
      label,
      tw - 12,
      Math.max(1, Math.floor((th - 10) / (fontSize * 1.15))),
    );
    const blockH = lines.length * fontSize * 1.15;
    const startY = ty + th / 2 - blockH / 2 + fontSize / 2;
    drawUprightInZone(ctx, tx + tw / 2, ty + th / 2, placement, () => {
      ctx.fillStyle = "#142418";
      ctx.font = `bold ${fontSize}px system-ui, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      lines.forEach((line, li) => {
        ctx.fillText(line, tx + tw / 2, startY + li * fontSize * 1.15);
      });
      ctx.textAlign = "left";
      ctx.textBaseline = "alphabetic";
    });
  }

  ctx.restore();
}

function drawMarks(
  ctx: CanvasRenderingContext2D,
  marks: MapMark[],
  areaX: number,
  areaY: number,
  areaW: number,
  areaH: number,
  placement?: ZoneOnBoard,
) {
  for (const mark of marks) {
    const color = mark.color || "#2d5a27";
    const px = (v: number) => areaX + (v / 100) * areaW;
    const py = (v: number) => areaY + (v / 100) * areaH;

    if (mark.kind === "line") {
      ctx.strokeStyle = color;
      ctx.lineWidth = 4;
      ctx.setLineDash([10, 8]);
      ctx.beginPath();
      ctx.moveTo(px(mark.x), py(mark.y));
      ctx.lineTo(px(mark.x2 ?? mark.x), py(mark.y2 ?? mark.y));
      ctx.stroke();
      ctx.setLineDash([]);
      continue;
    }

    if (mark.kind === "rect") {
      const mx = px(mark.x);
      const my = py(mark.y);
      const mw = ((mark.w ?? 10) / 100) * areaW;
      const mh = ((mark.h ?? 10) / 100) * areaH;
      ctx.strokeStyle = color;
      ctx.lineWidth = 3;
      ctx.setLineDash([8, 6]);
      ctx.strokeRect(mx, my, mw, mh);
      ctx.setLineDash([]);
      continue;
    }

    ctx.fillStyle = color;
    const fontPx = Math.max(
      14,
      Math.round(((mark.fontSize ?? 3.2) / 100) * areaH * 1.15),
    );
    const tx = px(mark.x);
    const ty = py(mark.y);
    const markDeg = markRotationDeg(mark);
    drawUprightInZone(ctx, tx, ty, placement, () => {
      ctx.save();
      ctx.translate(tx, ty);
      if (markDeg) ctx.rotate((markDeg * Math.PI) / 180);
      ctx.font = `bold ${fontPx}px system-ui, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(mark.text || "Etichetta", 0, 0);
      ctx.restore();
      ctx.textAlign = "left";
      ctx.textBaseline = "alphabetic";
    });
  }
}

/** Genera e scarica PNG della cartina globale (A4 verticale). */
export function downloadCartinaPng(opts: {
  items: { zone: ZoneLayout; placement: ZoneOnBoard }[];
  marks: MapMark[];
  reservations: Reservation[];
  title: string;
  subtitle: string;
  filename?: string;
}) {
  const { items, marks, reservations, title, subtitle } = opts;
  // A4 portrait ~300dpi
  const W = 2480;
  const H = 3508;
  const pad = 16;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, W, H);

  ctx.fillStyle = "#142418";
  ctx.font = "bold 44px system-ui, sans-serif";
  ctx.fillText(title, pad, pad + 40);
  ctx.font = "28px system-ui, sans-serif";
  ctx.fillStyle = "#5a7260";
  ctx.fillText(subtitle, pad, pad + 80);

  const headerH = 96;
  const areaX = pad;
  const areaY = pad + headerH;
  const areaW = W - pad * 2;
  const areaH = H - pad * 2 - headerH;

  for (const { zone, placement } of items) {
    const x = areaX + (placement.x / 100) * areaW;
    const y = areaY + (placement.y / 100) * areaH;
    const w = (placement.w / 100) * areaW;
    const h = (placement.h / 100) * areaH;
    drawZoneBlock(ctx, zone, reservations, x, y, w, h, placement);
  }

  // Marks sopra le zone (come in anteprima z-20)
  drawMarks(ctx, marks, areaX, areaY, areaW, areaH);

  const link = document.createElement("a");
  link.download =
    opts.filename ??
    `cartina-feste-del-bosco-${new Date().toISOString().slice(0, 10)}.png`;
  link.href = canvas.toDataURL("image/png");
  link.click();
}
