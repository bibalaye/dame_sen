// Game types for Senegalese Checkers

export type PlayerType = 'white' | 'black';

export interface PieceType {
  player: PlayerType;
  isKing: boolean;
}

export interface CellType {
  piece: PieceType | null;
}

export interface SelectedCellType {
  row: number;
  col: number;
}

export interface MoveType {
  fromRow?: number;
  fromCol?: number;
  toRow: number;
  toCol: number;
  captureRow?: number;
  captureCol?: number;
}

export interface GameHistoryItem {
  move: MoveType;
  boardState: number[];
  score: number;
}

export interface GameState {
  winner: PlayerType | null;
  timestamp: number;
  moves: GameHistoryItem[];
}