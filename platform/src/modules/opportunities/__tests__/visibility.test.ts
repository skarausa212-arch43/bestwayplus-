import { describe, expect, it } from 'vitest';
import {
  CLIENT_OPPORTUNITY_SELECT,
  CLIENT_PARTICIPANT_SELECT,
  INTERNAL_OPPORTUNITY_FIELDS,
  INTERNAL_PARTICIPANT_FIELDS,
} from '../select';

/**
 * These assertions exist because "we filter it in the component" is exactly
 * how internal notes end up in a JSON payload. The projection is the control,
 * so the projection is what gets tested.
 */
describe('client-facing opportunity projection', () => {
  it('never selects an internal opportunity field', () => {
    for (const field of INTERNAL_OPPORTUNITY_FIELDS) {
      expect(CLIENT_OPPORTUNITY_SELECT).not.toHaveProperty(field);
    }
  });

  it('never selects an internal participant field', () => {
    for (const field of INTERNAL_PARTICIPANT_FIELDS) {
      expect(CLIENT_PARTICIPANT_SELECT).not.toHaveProperty(field);
    }
  });

  it('does not leak internal fields through the nested opportunity', () => {
    const nested = CLIENT_PARTICIPANT_SELECT.opportunity.select;
    for (const field of INTERNAL_OPPORTUNITY_FIELDS) {
      expect(nested).not.toHaveProperty(field);
    }
  });

  it('is an explicit allow-list, never a spread of the whole model', () => {
    // Every value is `true` or a nested select — no `...opportunity` shortcuts.
    for (const value of Object.values(CLIENT_OPPORTUNITY_SELECT)) {
      expect(value).toBe(true);
    }
  });

  it('still carries what the client needs to act', () => {
    for (const field of ['position', 'deadline', 'transferType', 'description'] as const) {
      expect(CLIENT_OPPORTUNITY_SELECT).toHaveProperty(field, true);
    }
  });
});
