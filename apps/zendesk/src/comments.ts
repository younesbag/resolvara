// Did a human agent reply publicly after the AI agent took part? Used for AI tickets whose
// metric set shows agent replies, so the Standard's human_handoff can rest on the order.
//
// Not yet confirmed on real AI-agent tickets (P0 checks 8 and 11 are pending): how Zendesk marks
// AI-agent comments. The detection below is deliberately conservative: when no AI comment can be
// told apart, the answer is null (order unknown) and the audit falls back to the reply count.
import type { ZComment, ZUser } from './types';

const AI_SOURCE = /ai[_\s-]?agent|answer[_\s-]?bot|\bbot\b/i;
const STAFF = new Set(['agent', 'admin']);

function isAiComment(c: ZComment, role: string | undefined, requesterId: number | null | undefined): boolean {
  if (AI_SOURCE.test(c.via?.source?.rel ?? '') || AI_SOURCE.test(c.via?.channel ?? '')) return true;
  // A non-staff author who is not the requester: the AI agent's system user.
  return role !== undefined && !STAFF.has(role) && c.author_id !== requesterId;
}

export function replyAfterAi(
  comments: ZComment[],
  users: ZUser[],
  requesterId: number | null | undefined,
): boolean | null {
  const roles = new Map(users.map((u) => [u.id, u.role]));
  let firstAi = Infinity;
  const staff: number[] = [];
  for (const c of comments) {
    const t = Date.parse(c.created_at);
    if (Number.isNaN(t)) continue;
    const role = roles.get(c.author_id);
    if (isAiComment(c, role, requesterId)) {
      if (t < firstAi) firstAi = t;
    } else if (c.public && role !== undefined && STAFF.has(role)) {
      staff.push(t);
    }
  }
  if (staff.length === 0) return false;
  if (firstAi === Infinity) return null;
  return staff.some((t) => t > firstAi);
}
