export function clamp(value: number, min: number, max: number): number {
	return Math.min(Math.max(value, min), max);
}

export function calculateTotalPages(totalItems: number, pageSize: number): number {
	if (pageSize <= 0) return 1;
	return Math.max(1, Math.ceil(totalItems / pageSize));
}
