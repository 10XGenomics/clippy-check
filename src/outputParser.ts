import { join as pathJoin } from "path";

import * as core from "@actions/core";

import type { AnnotationWithMessageAndLevel, CargoMessage, Stats } from "./schema";
import { AnnotationLevel } from "./schema";

export class OutputParser {
    private _uniqueAnnotations: Map<string, AnnotationWithMessageAndLevel>;
    private _stats: Stats;
    private _workingDirectory?: string;

    public constructor(workingDirectory?: string) {
        this._uniqueAnnotations = new Map();
        this._stats = {
            ice: 0,
            error: 0,
            warning: 0,
            note: 0,
            help: 0,
        };
        this._workingDirectory = workingDirectory;
    }

    public get stats(): Stats {
        return this._stats;
    }

    public get annotations(): AnnotationWithMessageAndLevel[] {
        return [...this._uniqueAnnotations.values()];
    }

    public tryParseClippyLine(line: string): void {
        let contents: CargoMessage;
        try {
            contents = JSON.parse(line);
        } catch (error) {
            core.debug("Not a JSON, ignoring it");
            return;
        }

        if (contents.reason !== "compiler-message") {
            if (
                contents.reason !== "compiler-artifact" &&
                contents.reason !== "build-script-executed"
            ) {
                core.debug(`Unexpected reason field, ignoring it: ${contents.reason}`);
            }
            return;
        }

        if (contents.message.code === null) {
            core.debug("Message code is missing, ignoring it");
            return;
        }

        const parsedAnnotation = this.makeAnnotation(contents);
        const key = JSON.stringify(parsedAnnotation);

        if (this._uniqueAnnotations.has(key)) {
            return;
        }

        switch (contents.message.level) {
            case "help":
                this._stats.help += 1;
                break;
            case "note":
                this._stats.note += 1;
                break;
            case "warning":
                this._stats.warning += 1;
                break;
            case "error":
                this._stats.error += 1;
                break;
            case "error: internal compiler error":
                this._stats.ice += 1;
                break;
            default:
                break;
        }

        this._uniqueAnnotations.set(key, parsedAnnotation);
    }

    private static parseLevel(level: string): AnnotationLevel {
        switch (level) {
            case "help":
            case "note":
                return AnnotationLevel.Notice;
            case "warning":
                return AnnotationLevel.Warning;
            default:
                return AnnotationLevel.Error;
        }
    }

    private fixPath(file_name: string): string {
        if (this._workingDirectory) {
            return pathJoin(this._workingDirectory, file_name);
        }
        return file_name;
    }

    /// Convert parsed JSON line into the GH annotation object
    ///
    /// https://developer.github.com/v3/checks/runs/#annotations-object
    private makeAnnotation(contents: CargoMessage): AnnotationWithMessageAndLevel {
        const primarySpan = contents.message.spans.find((span) => {
            return span.is_primary === true;
        });

        // TODO: Handle it properly
        if (!primarySpan) {
            throw new Error("Unable to find primary span for message");
        }

        const annotation: AnnotationWithMessageAndLevel = {
            level: OutputParser.parseLevel(contents.message.level),
            message: contents.message.rendered,
            properties: {
                file: this.fixPath(primarySpan.file_name),
                startLine: primarySpan.line_start,
                endLine: primarySpan.line_end,
                title: contents.message.message,
            },
        };

        // Omit these parameters if `start_line` and `end_line` have different values.
        if (primarySpan.line_start === primarySpan.line_end) {
            annotation.properties.startColumn = primarySpan.column_start;
            annotation.properties.endColumn = primarySpan.column_end;
        }

        return annotation;
    }
}
