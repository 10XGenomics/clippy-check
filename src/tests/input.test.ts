import { get } from "../input";

describe("foo", () => {
    test("bar", () => {
        expect(get()).toStrictEqual({
            args: [],
            toolchain: undefined,
            useCross: false,
            workingDirectory: undefined,
        });
    });
});
