// Did a human agent reply publicly after the AI agent took part? Used for AI tickets whose
// metric set shows agent replies, so the Standard's human_handoff can rest on the order.
//
// Observed on real AI-agent tickets (trial account, 2026-10-25): the AI agent's messages are NOT
// ticket comments. An AI-agent ticket holds one private placeholder comment ("Conversation with
// Web User ...") and the transcript lives in Sunshine Conversations. So for a ticket that started
// as an AI-agent conversation, the AI took part from the start: pass that start as `aiStart`, and
// any later public staff comment is a human reply after the AI. A comment explicitly marked as the
// AI's still counts if it ever appears. Without either, the order is unknown (null); an end-user
// CC or an unmarked bot user is never taken for the AI.
//
// Observed on 2026-10-28 (trial account): when a messaging session ends, Zendesk adds one public
// comment with via.channel "chat_transcript", authored by a system user, holding the whole session
// as "(16:22:11) Name: text" lines: the AI agent, the customer and any teammate. A teammate's reply
// in messaging never becomes a comment of its own, so it is only visible in that transcript, by name.
import type { ZComment, ZUser } from './types';

const AI_SOURCE = /ai[_\s-]?agent|answer[_\s-]?bot|\bbot\b/i;
const STAFF = new Set(['agent', 'admin']);
const TRANSCRIPT_LINE = /^\(\d{1,2}:\d{2}(?::\d{2})?\)\s+(.+?):\s/gm;

/** Names that speak in a chat transcript comment, in order. */
export function transcriptSpeakers(body: string): string[] {
  return [...body.matchAll(TRANSCRIPT_LINE)].map((m) => m[1].trim());
}

function transcriptHasStaff(c: ZComment, staffNames: ReadonlySet<string>): boolean {
  if (c.via?.channel !== 'chat_transcript' || staffNames.size === 0) return false;
  return transcriptSpeakers(c.plain_body ?? c.body ?? '').some((n) => staffNames.has(n));
}

function isAiComment(c: ZComment): boolean {
  return AI_SOURCE.test(c.via?.source?.rel ?? '') || AI_SOURCE.test(c.via?.channel ?? '');
}

export function replyAfterAi(
  comments: ZComment[],
  users: ZUser[],
  aiStart?: string | null,
  staffNames: ReadonlySet<string> = new Set(),
): boolean | null {
  const roles = new Map(users.map((u) => [u.id, u.role]));
  let firstAi = Infinity;
  const staff: number[] = [];
  for (const c of comments) {
    const t = Date.parse(c.created_at);
    if (Number.isNaN(t)) continue;
    const role = roles.get(c.author_id);
    // A teammate named in the transcript of an AI-started conversation spoke after the AI.
    if (aiStart && transcriptHasStaff(c, staffNames)) return true;
    if (isAiComment(c)) {
      if (t < firstAi) firstAi = t;
    } else if (c.public && role !== undefined && STAFF.has(role)) {
      staff.push(t);
    }
  }
  if (staff.length === 0) return false;
  const start = aiStart ? Date.parse(aiStart) : NaN;
  if (!Number.isNaN(start) && start < firstAi) firstAi = start;
  if (firstAi === Infinity) return null;
  return staff.some((t) => t > firstAi);
}
