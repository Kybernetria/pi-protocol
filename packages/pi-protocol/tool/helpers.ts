export function requireText(value: string | undefined, message: string): string {
  const trimmed = value?.trim();
  if (!trimmed) throw new Error(message);
  return trimmed;
}

export function createProtocolToolId(prefix: string): string {
  return `${prefix}_${globalThis.crypto.randomUUID()}`;
}

export interface MutableTextComponent {
  render(width: number): string[];
  invalidate(): void;
  setText(text: string): void;
}

export function createTextComponent(text: string, previous?: unknown): MutableTextComponent {
  if (isMutableTextComponent(previous)) {
    previous.setText(text);
    return previous;
  }

  let currentText = text;
  return {
    render(width) {
      return currentText.split("\n").flatMap((line) => wrapLine(line, Math.max(1, width)));
    },
    invalidate() {},
    setText(nextText) {
      currentText = nextText;
    },
  };
}

function isMutableTextComponent(value: unknown): value is MutableTextComponent {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as MutableTextComponent).render === "function" &&
    typeof (value as MutableTextComponent).invalidate === "function" &&
    typeof (value as MutableTextComponent).setText === "function"
  );
}

function wrapLine(line: string, width: number): string[] {
  if (visibleLength(line) <= width) return [line];

  const indent = line.match(/^\s*/)?.[0] ?? "";
  const continuationIndent = indent.length < width ? indent : "";
  const wrapped: string[] = [];
  let remaining = line;

  while (visibleLength(remaining) > width) {
    const available = Math.max(1, width - (wrapped.length > 0 ? visibleLength(continuationIndent) : 0));
    const prefix = wrapped.length > 0 ? continuationIndent : "";
    const { head, tail } = splitVisible(remaining, available);
    wrapped.push(prefix + head.trimEnd());
    remaining = tail.trimStart();
  }

  wrapped.push((wrapped.length > 0 ? continuationIndent : "") + remaining);
  return wrapped;
}

function splitVisible(text: string, maxVisibleChars: number): { head: string; tail: string } {
  let visibleChars = 0;
  let index = 0;
  let lastWhitespaceIndex = -1;

  while (index < text.length && visibleChars < maxVisibleChars) {
    const ansi = text.slice(index).match(/^\x1b\[[0-9;]*m/);
    if (ansi) {
      index += ansi[0].length;
      continue;
    }

    if (/\s/.test(text[index]!)) lastWhitespaceIndex = index;
    index += 1;
    visibleChars += 1;
  }

  const splitIndex = lastWhitespaceIndex > 0 && visibleChars >= maxVisibleChars ? lastWhitespaceIndex : index;
  return { head: text.slice(0, splitIndex), tail: text.slice(splitIndex) };
}

function visibleLength(text: string): number {
  return text.replace(/\x1b\[[0-9;]*m/g, "").length;
}

export function formatTarget(nodeId: string | undefined, provide: string | undefined): string {
  return `${formatValue(nodeId, "<node?>")}.${formatValue(provide, "<provide?>")}`;
}

export function formatValue(value: string | undefined, fallback: string): string {
  const trimmed = value?.trim();
  return trimmed || fallback;
}

export function formatOneLinePreview(preview: string, truncated: boolean | undefined): string {
  const oneLine = preview.replace(/\s+/g, " ").trim();
  const clipped = oneLine.length > 120 ? `${oneLine.slice(0, 120)}…` : oneLine;
  return truncated && !clipped.endsWith("…") ? `${clipped}…` : clipped;
}

export function indentPreviewLines(preview: string, indent: string, truncated: boolean | undefined): string[] {
  const lines = preview.split("\n").map((line) => `${indent}${line}`);
  if (truncated) lines.push(`${indent}…`);
  return lines;
}
