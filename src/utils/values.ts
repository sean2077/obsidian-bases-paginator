import { NullValue } from "obsidian";

/** Treat absence as empty without hiding valid zero or false values. */
export function isEmptyValue(value: unknown): boolean {
	if (value === null || value === undefined) return true;
	if (value instanceof NullValue) return true;
	if (typeof value === "string") return value.length === 0;
	if (Array.isArray(value)) return value.length === 0;
	if (typeof value === "object") {
		const toString = (value as { toString?: () => string }).toString;
		if (typeof toString !== "function") return false;
		try {
			return toString.call(value) === "";
		} catch {
			return false;
		}
	}
	return false;
}
