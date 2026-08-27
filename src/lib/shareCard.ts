/**
 * Carte de fin de partie, dessinée sur un canvas.
 *
 * Une partie gagnée ne laissait aucune trace : rien à montrer, rien à envoyer.
 * Cette image reprend la position finale, le score et la plus longue rafle —
 * de quoi transformer chaque victoire en quelque chose qu'on partage.
 */

import { BOARD_SIZE, type Board, type Player } from './engine';

export interface CardData {
  readonly board: Board;
  readonly winner: Player | null;
  readonly isDraw: boolean;
  /** Nom affiché du camp blanc, puis du camp noir. */
  readonly whiteName: string;
  readonly blackName: string;
  readonly whitePieces: number;
  readonly blackPieces: number;
  /** Plus longue rafle réussie pendant la partie. */
  readonly bestChain: number;
}

const SIZE = 1080;
const PALETTE = {
  ground: '#2a1c10',
  wood: '#7b5638',
  woodDark: '#4d331d',
  squareLight: '#cdb48d',
  squareDark: '#bfa176',
  pieceLight: '#f3ead7',
  pieceLightEdge: '#c9b490',
  pieceDark: '#2c2621',
  pieceDarkEdge: '#0d0b09',
  brass: '#c9922e',
  text: '#f5ecd9',
  textSoft: '#c3b195',
};

const roundedRect = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
) => {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + width, y, x + width, y + height, radius);
  ctx.arcTo(x + width, y + height, x, y + height, radius);
  ctx.arcTo(x, y + height, x, y, radius);
  ctx.arcTo(x, y, x + width, y, radius);
  ctx.closePath();
};

const drawBoard = (
  ctx: CanvasRenderingContext2D,
  board: Board,
  x: number,
  y: number,
  size: number,
) => {
  const cell = size / BOARD_SIZE;

  ctx.fillStyle = PALETTE.woodDark;
  roundedRect(ctx, x - 22, y - 22, size + 44, size + 44, 18);
  ctx.fill();

  for (let row = 0; row < BOARD_SIZE; row++) {
    for (let col = 0; col < BOARD_SIZE; col++) {
      ctx.fillStyle = (row * BOARD_SIZE + col) % 2 === 0
        ? PALETTE.squareLight
        : PALETTE.squareDark;
      ctx.fillRect(x + col * cell, y + row * cell, cell, cell);

      const piece = board[row][col];
      if (!piece) continue;

      const cx = x + col * cell + cell / 2;
      const cy = y + row * cell + cell / 2;
      const radius = cell * 0.36;

      ctx.beginPath();
      ctx.arc(cx, cy + radius * 0.12, radius, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(0,0,0,0.32)';
      ctx.fill();

      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.fillStyle =
        piece.player === 'white' ? PALETTE.pieceLight : PALETTE.pieceDark;
      ctx.fill();
      ctx.lineWidth = radius * 0.12;
      ctx.strokeStyle =
        piece.player === 'white' ? PALETTE.pieceLightEdge : PALETTE.pieceDarkEdge;
      ctx.stroke();

      // La dame porte son anneau de laiton, comme sur le plateau.
      if (piece.isKing) {
        ctx.beginPath();
        ctx.arc(cx, cy, radius * 0.5, 0, Math.PI * 2);
        ctx.lineWidth = radius * 0.14;
        ctx.strokeStyle = PALETTE.brass;
        ctx.stroke();
      }
    }
  }
};

/** Dessine la carte et renvoie le canvas prêt à être exporté. */
export const drawCard = (data: CardData): HTMLCanvasElement => {
  const canvas = document.createElement('canvas');
  canvas.width = SIZE;
  canvas.height = SIZE;

  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;

  const backdrop = ctx.createLinearGradient(0, 0, SIZE, SIZE);
  backdrop.addColorStop(0, PALETTE.wood);
  backdrop.addColorStop(1, PALETTE.ground);
  ctx.fillStyle = backdrop;
  ctx.fillRect(0, 0, SIZE, SIZE);

  const heading = data.isDraw
    ? 'Partie nulle'
    : `${data.winner === 'white' ? data.whiteName : data.blackName} l’emporte`;

  ctx.textAlign = 'center';
  ctx.fillStyle = PALETTE.textSoft;
  ctx.font = '600 34px "Segoe UI", Tahoma, sans-serif';
  ctx.fillText('DAMES SÉNÉGALAISES', SIZE / 2, 96);

  ctx.fillStyle = PALETTE.text;
  ctx.font = '800 62px "Segoe UI", Tahoma, sans-serif';
  ctx.fillText(heading, SIZE / 2, 176);

  drawBoard(ctx, data.board, 260, 240, 560);

  // Bandeau du bas : le score et le fait d'armes de la partie.
  const y = 900;
  ctx.fillStyle = 'rgba(0,0,0,0.28)';
  roundedRect(ctx, 90, y - 62, SIZE - 180, 132, 22);
  ctx.fill();

  ctx.font = '700 44px "Segoe UI", Tahoma, sans-serif';
  ctx.fillStyle = PALETTE.text;
  ctx.fillText(
    `${data.whiteName} ${data.whitePieces} — ${data.blackPieces} ${data.blackName}`,
    SIZE / 2,
    y - 4,
  );

  ctx.font = '500 32px "Segoe UI", Tahoma, sans-serif';
  ctx.fillStyle = PALETTE.brass;
  ctx.fillText(
    data.bestChain >= 2
      ? `Plus longue rafle : ${data.bestChain} prises`
      : 'Aucune rafle dans cette partie',
    SIZE / 2,
    y + 48,
  );

  return canvas;
};

const toBlob = (canvas: HTMLCanvasElement): Promise<Blob | null> =>
  new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));

/**
 * Propose la carte au joueur : partage natif si le navigateur le permet,
 * téléchargement sinon.
 */
export const shareCard = async (data: CardData): Promise<'shared' | 'downloaded' | 'failed'> => {
  try {
    const canvas = drawCard(data);
    const blob = await toBlob(canvas);
    if (!blob) return 'failed';

    const file = new File([blob], 'dame-sen.png', { type: 'image/png' });

    if (navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], title: 'Dames sénégalaises' });
      return 'shared';
    }

    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'dame-sen.png';
    link.click();
    URL.revokeObjectURL(url);
    return 'downloaded';
  } catch {
    // Partage annulé par le joueur, ou canvas indisponible.
    return 'failed';
  }
};
