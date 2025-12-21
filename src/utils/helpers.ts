import { Value } from 'obsidian';

/**
 * Check if a value is empty (null, undefined, empty string, "null", empty array, or falsy Value object).
 * This is the unified implementation used across all components.
 */
export function isEmptyValue(value: unknown): boolean {
	if (value === null || value === undefined) return true;
	if (value === '' || value === 'null') return true;
	if (Array.isArray(value) && value.length === 0) return true;
	if (typeof value === 'object' && value !== null) {
		// Check for Bases Value objects with isTruthy method
		if ('isTruthy' in value && typeof (value as { isTruthy: () => boolean }).isTruthy === 'function') {
			if (!(value as { isTruthy: () => boolean }).isTruthy()) {
				return true;
			}
		}
		const str = valueToString(value);
		if (str === 'null' || str === '') return true;
	}
	return false;
}

/**
 * Extract values from a cell value for filtering/processing.
 * Handles both Value objects (which may contain comma-separated values) and plain values.
 *
 * Note: Obsidian Bases returns list properties as single Value objects, not iterable arrays.
 * The string representation (via toString()) is comma-separated, e.g., "[[a]], [[b]], c".
 */
export function extractValueItems(value: unknown): string[] {
	if (value === null || value === undefined) return [];
	if (value instanceof Value) {
		return parseCommaSeparated(value.toString());
	}
	const str = valueToString(value);
	return str ? [str] : [];
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

/**
 * Natural string comparison (handles numeric parts correctly)
 * e.g., "file2" < "file10" instead of "file10" < "file2"
 */
export function naturalCompare(a: string, b: string): number {
	return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
}

/**
 * Parse comma-separated string, respecting wikilink brackets.
 * Handles: "[[a]], [[b]]", "a, b, c", "[[a]], b, [[c]]", "[[page, with comma]]"
 */
export function parseCommaSeparated(str: string): string[] {
	if (!str) return [];

	const items: string[] = [];
	let current = '';
	let bracketDepth = 0;

	for (let i = 0; i < str.length; i++) {
		const char = str[i];
		const nextChar = str[i + 1];

		// Track [[ and ]]
		if (char === '[' && nextChar === '[') {
			bracketDepth++;
			current += char;
		} else if (char === ']' && nextChar === ']') {
			bracketDepth--;
			current += char;
		} else if (char === ',' && bracketDepth === 0) {
			// Split on comma only when not inside brackets
			const trimmed = current.trim();
			if (trimmed) items.push(trimmed);
			current = '';
		} else {
			current += char;
		}
	}

	// Add last item
	const trimmed = current.trim();
	if (trimmed) items.push(trimmed);

	return items;
}
