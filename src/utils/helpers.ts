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
 * Check if a value is array-like (array, iterable, or has numeric length with indexed elements)
 */
export function isArrayLike(value: unknown): boolean {
	if (value === null || value === undefined) return false;
	if (typeof value === 'string') return false; // Strings should not be expanded
	if (Array.isArray(value)) return true;

	if (typeof value === 'object') {
		// Check for iterable objects with Symbol.iterator
		if (Symbol.iterator in value) return true;

		// Check for array-like objects (has numeric length property and indexed elements)
		const obj = value as Record<string, unknown>;
		if (typeof obj.length === 'number' && obj.length >= 0 && Number.isInteger(obj.length)) {
			return obj.length === 0 || '0' in obj;
		}
	}

	return false;
}

/**
 * Convert an array-like value to an array. Non-array values return [value].
 */
export function toArray(value: unknown): unknown[] {
	if (Array.isArray(value)) return value;
	if (!isArrayLike(value)) return [value];

	// Handle iterable objects
	if (typeof value === 'object' && value !== null && Symbol.iterator in value) {
		return Array.from(value as Iterable<unknown>);
	}

	// Handle array-like objects with length property
	const obj = value as Record<string, unknown>;
	const result: unknown[] = [];
	for (let i = 0; i < (obj.length as number); i++) {
		result.push(obj[i]);
	}
	return result;
}

/**
 * Natural string comparison (handles numeric parts correctly)
 * e.g., "file2" < "file10" instead of "file10" < "file2"
 */
export function naturalCompare(a: string, b: string): number {
	return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
}

/**
 * Split a multi-value string into individual values.
 * Handles wikilink format: "[[a]], [[b]]" -> ["[[a]]", "[[b]]"]
 *
 * If the string doesn't contain multiple wikilinks, returns [str].
 */
export function splitMultiValues(str: string): string[] {
	if (!str) return [str];

	// Check for wikilink format: [[...]], [[...]]
	const wikiLinkMatches = str.match(/\[\[[^\]]+\]\]/g);
	if (wikiLinkMatches && wikiLinkMatches.length > 1) {
		return wikiLinkMatches;
	}

	return [str];
}
