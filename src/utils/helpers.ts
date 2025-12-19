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
 * Safely convert a value to string, handling objects properly
 */
export function valueToString(value: unknown): string {
	if (value === null || value === undefined) {
		return '';
	}
	if (typeof value === 'string') {
		return value;
	}
	if (typeof value === 'number' || typeof value === 'boolean') {
		return String(value);
	}
	if (value instanceof Date) {
		return value.toLocaleDateString();
	}
	if (Array.isArray(value)) {
		return value.map((item) => valueToString(item)).join(', ');
	}
	// Check for objects with toString method that returns meaningful value
	if (typeof value === 'object' && value !== null) {
		// Check if it's a file link object
		if ('path' in value) {
			const fileObj = value as { path: string; display?: string };
			return fileObj.display ?? fileObj.path;
		}
		// Check for custom toString (not the default Object.prototype.toString)
		const valueObj = value as { toString?: () => string };
		if (typeof valueObj.toString === 'function' && valueObj.toString !== Object.prototype.toString) {
			const str = valueObj.toString();
			if (str !== '[object Object]') {
				return str;
			}
		}
		// Try JSON for other objects
		try {
			return JSON.stringify(value);
		} catch {
			return '';
		}
	}
	return '';
}

/**
 * Check if a string contains another string (case-insensitive)
 */
export function containsIgnoreCase(str: string, search: string): boolean {
	return str.toLowerCase().includes(search.toLowerCase());
}
