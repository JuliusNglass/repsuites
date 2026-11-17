// The service part of a prospect search, without the business name or place.
// Examples: "cleaning company Birmingham UK" -> "cleaning company" and
// "auto detailing in Newport" -> "auto detailing".
export function prospectSearchTopic(query: string, businessName: string, address = ""): string {
  const q = query.trim();
  if (!q || q.toLowerCase().includes(businessName.toLowerCase().slice(0, 6))) return "";

  let topic = q
    .replace(/\s+(in|near|around|at)\s+.*$/i, "")
    .replace(/\s+(uk|u\.k\.|gb|great britain|united kingdom|england|scotland|wales|northern ireland)\s*$/i, "")
    .trim();

  // Google often returns "Street, Town POSTCODE" without a country suffix.
  // Remove that town when it is also the final part of the user's query.
  const parts = address.split(",").map((part) => part.trim()).filter(Boolean);
  for (const part of parts.reverse()) {
    const place = part
      .replace(/\b[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}\b/gi, "")
      .trim();
    if (place && new RegExp(`\\s+${escapeRegExp(place)}$`, "i").test(topic)) {
      topic = topic.slice(0, topic.length - place.length).trim();
      break;
    }
  }

  return topic.slice(0, 80);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
