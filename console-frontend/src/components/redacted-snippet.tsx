export function RedactedSnippet({ value }: { value: string }) {
  const runs = value.match(/(\*+|[^*]+)/g) ?? [value];
  return (
    <span className="inline-flex items-center gap-0.5 font-mono text-sm">
      {runs.map((run, i) =>
        run[0] === "*" ? (
          <span
            key={i}
            className="redaction-mask inline-block h-3.5 rounded-[2px]"
            style={{ width: `${run.length * 0.62}em` }}
            aria-label={`${run.length} characters redacted`}
          />
        ) : (
          <span key={i}>{run}</span>
        ),
      )}
    </span>
  );
}
