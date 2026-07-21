export const MIN_PAGE_SIZE = 1;
export const MAX_PAGE_SIZE = 1000;
export const DEFAULT_PAGE_SIZE = 25;

export function isValidPageSize(value: unknown): value is number {
	return typeof value === "number" && Number.isInteger(value) && value >= MIN_PAGE_SIZE && value <= MAX_PAGE_SIZE;
}
