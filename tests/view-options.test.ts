import { describe, expect, it } from "vitest";
import { getViewOptions } from "../src/views/viewOptions";
import { DEFAULT_SETTINGS } from "../src/utils/constants";

describe("view option defaults", () => {
	it("applies current plugin defaults to newly created views", () => {
		const options = getViewOptions({ ...DEFAULT_SETTINGS, defaultPageSize: 50, stickyHeader: false });
		expect(options).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ key: "pageSize", default: "50" }),
				expect.objectContaining({ key: "stickyHeader", default: false }),
			])
		);
	});
});
