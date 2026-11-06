export function chooseReportKeyword(input: {
  keyword?: string | undefined;
  topic?: string | undefined;
  category?: string | undefined;
  type?: string | undefined;
}): string {
  return (input.keyword || input.topic || input.category || input.type || "")
    .trim()
    .toLowerCase()
    .slice(0, 80);
}
