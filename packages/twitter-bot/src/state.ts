import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

export interface State {
  nextIndex: number;
  history: Array<{ id: string; postedAt: number }>;
}

const initialState: State = { nextIndex: 0, history: [] };

export function loadState(filePath: string): State {
  if (!existsSync(filePath)) return initialState;
  try {
    return JSON.parse(readFileSync(filePath, 'utf-8')) as State;
  } catch {
    return initialState;
  }
}

export function saveState(filePath: string, state: State): void {
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, JSON.stringify(state, null, 2));
}
