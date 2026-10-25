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
import type { ZComment, ZUser } from './types';

const AI_SOURCE = /ai[_\s-]?agent|answer[_\s-]?bot|\bbot\b/i;
const STAFF = new Set(['agent', 'admin']);

function isAiComment(c: ZComment): boolean {
  return AI_SOURCE.test(c.via?.source?.rel ?? '') || AI_SOURCE.test(c.via?.channel ?? '');
}

export function replyAfterAi(
  comments: ZComment[],
  users: ZUser[],
  aiStart?: string | null,
): boolean | null {
  const roles = new Map(users.map((u) => [u.id, u.role]));
  let firstAi = Infinity;
  const staff: number[] = [];
  for (const c of comments) {
    const t = Date.parse(c.created_at);
    if (Number.isNaN(t)) continue;
    const role = roles.get(c.author_id);
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
