import { describe, expect, it } from "vitest";
import { isEmptyValue } from "../src/utils/helpers";

describe("value helpers", () => {
	it("keeps zero and false as non-empty values", () => {
		expect(isEmptyValue(0)).toBe(false);
		expect(isEmptyValue(false)).toBe(false);
		expect(isEmptyValue({ toString: () => "0", isTruthy: () => false })).toBe(false);
		expect(isEmptyValue({ toString: () => "false", isTruthy: () => false })).toBe(false);
	});
});
