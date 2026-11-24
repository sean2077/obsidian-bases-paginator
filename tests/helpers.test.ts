import { describe, expect, it } from "vitest";
import { NullValue } from "obsidian";
import { isEmptyValue } from "../src/utils/values";

describe("value helpers", () => {
	it("keeps zero and false as non-empty values", () => {
		expect(isEmptyValue(0)).toBe(false);
		expect(isEmptyValue(false)).toBe(false);
		expect(isEmptyValue({ toString: () => "0", isTruthy: () => false })).toBe(false);
		expect(isEmptyValue({ toString: () => "false", isTruthy: () => false })).toBe(false);
	});

	it("distinguishes absent values from the literal text null", () => {
		expect(isEmptyValue(null)).toBe(true);
		expect(isEmptyValue(undefined)).toBe(true);
		expect(isEmptyValue(NullValue.value)).toBe(true);
		expect(isEmptyValue("null")).toBe(false);
		expect(isEmptyValue({ toString: () => "null" })).toBe(false);
	});
});
