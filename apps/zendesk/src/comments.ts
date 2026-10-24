// Did a human agent reply publicly after the AI agent took part? Used for AI tickets whose
// metric set shows agent replies, so the Standard's human_handoff can rest on the order.
//
// Not yet confirmed on real AI-agent tickets (P0 checks 8 and 11 are pending): how Zendesk marks
// AI-agent comments. Only an explicit marker on the comment counts as the AI. Anything else (an
// end-user CC, the requester under a second identity, an unmarked bot user) is not evidence, so
// when no marked AI comment exists the answer is null (order unknown) and the audit falls back to
// the reply count.
import type { ZComment, ZUser } from './types';

const AI_SOURCE = /ai[_\s-]?agent|answer[_\s-]?bot|\bbot\b/i;
const STAFF = new Set(['agent', 'admin']);

function isAiComment(c: ZComment): boolean {
  return AI_SOURCE.test(c.via?.source?.rel ?? '') || AI_SOURCE.test(c.via?.channel ?? '');
}

export function replyAfterAi(
  comments: ZComment[],
  users: ZUser[],
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
  if (firstAi === Infinity) return null;
  return staff.some((t) => t > firstAi);
}
