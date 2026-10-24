// The summary and email draft leave the app, so they must say what "billed" rests on.
import type { MapInput } from "./types";

/** Say in the text that leaves the app what "billed" rests on: the tier proxy or the Usage CSV. */
export function withBilledBasis(summary: string, input: MapInput): string {
  const exact = Array.isArray(input.billedIds);
  const line = exact
    ? `Billed basis: the ${input.billedIds?.length ?? 0} ticket ids in the Zendesk Usage > Resolutions export.`
    : `Billed basis: tickets whose Resolution tier is "Verified resolution". This is an estimate; Admin Center > Usage > Resolutions has the exact billed list.`;
  const email = exact
    ? `Our billed count comes from the Usage > Resolutions export of billed tickets.`
    : `Our billed count comes from the Resolution tier field on each ticket (Verified resolution). Please tell us if your billing records differ.`;
  let out = summary;
  const anchor = "\nReally resolved, of those billed:";
  out = out.includes(anchor) ? out.replace(anchor, `\n${line}${anchor}`) : `${out}\n${line}`;
  const mailAnchor = "\n\nWe have attached the list";
  if (out.includes(mailAnchor)) out = out.replace(mailAnchor, `\n\n${email}${mailAnchor}`);
  return out;
}
