import { describe, expect, it } from 'vitest';
import { completionPercent, evaluateChecklist, nextStep, type CompletionSnapshot } from '../completion';

const empty: CompletionSnapshot = {};

const personal: CompletionSnapshot = {
  firstName: 'A', lastName: 'B', dateOfBirth: '2003-01-01',
  nationality: 'PL', countryOfResidence: 'PL', city: 'Warsaw',
};

const complete: CompletionSnapshot = {
  ...personal,
  primaryPosition: 'CB', preferredFoot: 'RIGHT', heightCm: 188,
  currentClub: 'Club', league: 'League',
  careerSummary: 'Summary', preferredCountries: ['PL'], availability: 'Immediate',
  highlightsUrl: 'https://example.org/reel',
  documentTypes: ['PASSPORT_ID', 'PLAYER_CV', 'CLUB_CONTRACT', 'PHOTO'],
};

describe('completion', () => {
  it('is 0 for an empty profile and 100 for a full one', () => {
    expect(completionPercent(empty)).toBe(0);
    expect(completionPercent(complete)).toBe(100);
  });

  it('weights sum to 100, so the percentage is always meaningful', () => {
    const total = evaluateChecklist(empty).reduce((sum, item) => sum + item.weight, 0);
    expect(total).toBe(100);
  });

  it('does not credit a partially filled group', () => {
    const partial: CompletionSnapshot = { ...personal, city: null };
    expect(evaluateChecklist(partial).find((i) => i.key === 'personal')?.done).toBe(false);
  });

  it('treats whitespace as empty', () => {
    expect(evaluateChecklist({ ...personal, city: '   ' }).find((i) => i.key === 'personal')?.done).toBe(false);
  });

  it('accepts any single video link as highlights', () => {
    for (const field of ['highlightsUrl', 'youtubeUrl', 'transfermarktUrl'] as const) {
      const snapshot: CompletionSnapshot = { [field]: 'https://example.org/x' };
      expect(evaluateChecklist(snapshot).find((i) => i.key === 'highlights')?.done).toBe(true);
    }
  });

  it('surfaces the heaviest outstanding item as the next step', () => {
    expect(nextStep(empty)?.key).toBe('football'); // weight 20
    expect(nextStep({ ...complete, documentTypes: ['PLAYER_CV', 'CLUB_CONTRACT', 'PHOTO'] })?.key)
      .toBe('passport'); // weight 15
  });

  it('returns no next step once everything is done', () => {
    expect(nextStep(complete)).toBeNull();
  });
});
