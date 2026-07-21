/** Treat absence as empty without hiding valid zero or false values. */
export function isEmptyValue(value: unknown): boolean {
	if (value === null || value === undefined) return true;
	if (typeof value === "string") return value.length === 0 || value === "null";
	if (Array.isArray(value)) return value.length === 0;
	if (typeof value === "object") {
		const toString = (value as { toString?: () => string }).toString;
		if (typeof toString !== "function") return false;
		try {
			return ["", "null"].includes(toString.call(value));
		} catch {
			return false;
		}
	}
	return false;
}

export function clamp(value: number, min: number, max: number): number {
	return Math.min(Math.max(value, min), max);
}

export function calculateTotalPages(totalItems: number, pageSize: number): number {
	if (pageSize <= 0) return 1;
	return Math.max(1, Math.ceil(totalItems / pageSize));
}
