import { describe, expect, it } from 'vitest';
import { zendeskTier } from '../presets';

// Option values observed live in a Zendesk account via /api/v2/ticket_fields.json (2026-10-24).
describe('zendeskTier accepts API option values as well as labels', () => {
  it('maps core_resolution to verified (billed)', () => {
    expect(zendeskTier('zd_resolution_tier_core_resolution', 'zd_automated_resolution', '')).toEqual({ state: 'verified', billed: true, ai: true });
    expect(zendeskTier('Verified resolution', 'Automated', '')).toEqual({ state: 'verified', billed: true, ai: true });
  });
  it('maps contained and assisted escalation values', () => {
    expect(zendeskTier('zd_resolution_tier_contained_resolution', 'zd_automated_resolution', '').state).toBe('contained');
    expect(zendeskTier('zd_resolution_tier_assisted_escalation', 'zd_assisted_resolution', '').state).toBe('escalated');
  });
  it('maps non-automated to not_ai', () => {
    expect(zendeskTier('zd_resolution_tier_non_automated', '', '')).toEqual({ state: 'not_ai', billed: false, ai: false });
    expect(zendeskTier('Non-automated', '', '')).toEqual({ state: 'not_ai', billed: false, ai: false });
  });
});
