import { describe, expect, it } from 'vitest';
import {
  NEVER_SHARED, SECTION_FIELDS, SHARE_SECTIONS,
  allowedFields, normaliseSections, projectProfile,
} from '../sections';

const nothing = normaliseSections({});

describe('share sections', () => {
  it('include nothing by default', () => {
    expect(Object.values(nothing).every((on) => on === false)).toBe(true);
    expect(allowedFields(nothing)).toEqual([]);
  });

  it('treat any non-true value as off', () => {
    const sections = normaliseSections({ identity: 'yes', football: 1, career: null, links: true });
    expect(sections.identity).toBe(false);
    expect(sections.football).toBe(false);
    expect(sections.career).toBe(false);
    expect(sections.links).toBe(true);
  });

  it('never expose salary, representation or internal fields', () => {
    const everything = normaliseSections(
      Object.fromEntries(SHARE_SECTIONS.map((s) => [s, true])),
    );
    const fields = new Set(allowedFields(everything));
    for (const banned of NEVER_SHARED) {
      expect(fields.has(banned)).toBe(false);
    }
  });

  it('strips a banned field even if a section is edited to include it', () => {
    // Simulates a future mistake: someone adds salaryMin to the career section.
    const original = SECTION_FIELDS.career as unknown as string[];
    const patched = [...original, 'salaryMin'];
    (SECTION_FIELDS as Record<string, readonly string[]>).career = patched;
    try {
      const sections = normaliseSections({ career: true });
      expect(allowedFields(sections)).not.toContain('salaryMin');
    } finally {
      (SECTION_FIELDS as Record<string, readonly string[]>).career = original;
    }
  });

  it('drops any field outside the allow-list when projecting', () => {
    const profile = {
      firstName: 'A', nationality: 'PL',
      salaryMin: 1000, agentName: 'Someone', internalRating: 9,
    };
    const projected = projectProfile(profile, normaliseSections({ identity: true }));
    expect(projected).toEqual({ firstName: 'A', nationality: 'PL' });
  });

  it('returns nothing at all when no section is enabled', () => {
    expect(projectProfile({ firstName: 'A' }, nothing)).toEqual({});
  });
});
