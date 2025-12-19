/**
 * Debounce a function call
 */
export function debounce<T extends (...args: unknown[]) => void>(
	fn: T,
	delay: number
): (...args: Parameters<T>) => void {
	let timeoutId: ReturnType<typeof setTimeout> | null = null;

	return (...args: Parameters<T>) => {
		if (timeoutId) {
			clearTimeout(timeoutId);
		}
		timeoutId = setTimeout(() => {
			fn(...args);
			timeoutId = null;
		}, delay);
	};
}

/**
 * Generate a unique ID
 */
export function generateId(): string {
	return Date.now().toString(36) + Math.random().toString(36).substring(2);
}

/**
 * Clamp a number between min and max
 */
export function clamp(value: number, min: number, max: number): number {
	return Math.min(Math.max(value, min), max);
}

/**
 * Calculate total pages from total items and page size
 */
export function calculateTotalPages(totalItems: number, pageSize: number): number {
	if (pageSize <= 0) return 1;
	return Math.max(1, Math.ceil(totalItems / pageSize));
}

/**
 * Get the start and end indices for a page
 */
export function getPageIndices(
	page: number,
	pageSize: number,
	totalItems: number
): { start: number; end: number } {
	const start = (page - 1) * pageSize;
	const end = Math.min(start + pageSize, totalItems);
	return { start, end };
}

/**
 * Safely parse JSON with a fallback value
 */
export function safeJsonParse<T>(json: string, fallback: T): T {
	try {
		return JSON.parse(json) as T;
	} catch {
		return fallback;
	}
}

/**
 * Format a value for display in a table cell
 */
export function formatCellValue(value: unknown): string {
	if (value === null || value === undefined) {
		return '';
	}
	if (typeof value === 'boolean') {
		return value ? '✓' : '✗';
	}
	if (value instanceof Date) {
		return value.toLocaleDateString();
	}
	if (Array.isArray(value)) {
		return value.map(String).join(', ');
	}
	return String(value);
}

/**
 * Check if a string contains another string (case-insensitive)
 */
export function containsIgnoreCase(str: string, search: string): boolean {
	return str.toLowerCase().includes(search.toLowerCase());
}

/**
 * Escape special characters for use in a regex
 */
export function escapeRegex(str: string): string {
	return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
