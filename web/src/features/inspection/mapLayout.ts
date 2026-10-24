import type { Structure } from "../../data/types";

// Shared layout math so the grid, robot, coverage, and pins all align.
export const CELL = 36; // px per grid cell
export const PAD = 12; // px padding around the grid

export function gridCols(structure: Structure): number {
  return structure.grid[0]?.length ?? 0;
}

export function gridRows(structure: Structure): number {
  return structure.grid.length;
}

export function svgWidth(structure: Structure): number {
  return gridCols(structure) * CELL + PAD * 2;
}

export function svgHeight(structure: Structure): number {
  return gridRows(structure) * CELL + PAD * 2;
}

// Center pixel of a grid cell (x = column, y = row; origin top-left).
export function cellCenter(x: number, y: number): { cx: number; cy: number } {
  return {
    cx: PAD + x * CELL + CELL / 2,
    cy: PAD + y * CELL + CELL / 2,
  };
}
