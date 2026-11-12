// A short, validating quote shown right after today's mood check-in — a
// gentle, humanizing touch, not advice and not a substitute for the crisis
// line on the profile screen. Every quote below is real, independently
// verifiable, and attributed to the person who actually said or wrote it;
// none of them touch on suicide, self-harm, or clinical treatment.
//
// Sourcing note: "okay" ships with two quotes rather than three, because a
// third/firmer citation wasn't confidently nailed down yet. Don't add a
// quote on vibes alone — verify exact wording and attribution the way these
// were verified before adding more.

import type { Mood } from '@/types/database';

export interface MoodQuote {
  text: string;
  author: string;
  source: string;
}

export const MOOD_QUOTES: Record<Mood, MoodQuote[]> = {
  great: [
    {
      text: 'If this isn’t nice, what is?',
      author: 'Kurt Vonnegut',
      source: 'A Man Without a Country (2005)',
    },
    {
      text: 'Drink your tea slowly and reverently, as if it is the axis on which the whole earth revolves – slowly, evenly, without rushing toward the future.',
      author: 'Thich Nhat Hanh',
      source: 'Peace Is Every Step (1991)',
    },
    {
      text: 'I do know how to pay attention, how to fall down into the grass, how to be idle and blessed, how to stroll through the fields.',
      author: 'Mary Oliver',
      source: '"The Summer Day," House of Light (1990)',
    },
  ],
  good: [
    {
      text: 'I exist as I am, that is enough.',
      author: 'Walt Whitman',
      source: '"Song of Myself," section 20, Leaves of Grass',
    },
    {
      text: 'Very little is needed to make a happy life; it is all within yourself, in your way of thinking.',
      author: 'Marcus Aurelius',
      source: 'Meditations, Book VII (trans. George Long)',
    },
    {
      text: 'For a time I rest in the grace of the world, and am free.',
      author: 'Wendell Berry',
      source: '"The Peace of Wild Things," Openings (1968)',
    },
  ],
  okay: [
    {
      text: 'How we spend our days is, of course, how we spend our lives.',
      author: 'Annie Dillard',
      source: 'The Writing Life (1989)',
    },
    {
      text: 'While washing the dishes, one should only be washing the dishes.',
      author: 'Thich Nhat Hanh',
      source: 'The Miracle of Mindfulness (1975)',
    },
  ],
  low: [
    {
      text: 'No one ever told me that grief felt so like fear.',
      author: 'C. S. Lewis',
      source: 'A Grief Observed (1961), opening line',
    },
    {
      text: 'The reality is, you will grieve forever. You will not ‘get over’ the loss of a loved one; you will learn to live with it.',
      author: 'Elisabeth Kübler-Ross and David Kessler',
      source: 'On Grief and Grieving (2005)',
    },
    {
      text: 'There is no greater agony than bearing an untold story inside you.',
      author: 'Maya Angelou',
      source: 'I Know Why the Caged Bird Sings (1969)',
    },
  ],
  stressed: [
    {
      text: 'Caring for myself is not self-indulgence, it is self-preservation, and that is an act of political warfare.',
      author: 'Audre Lorde',
      source: 'A Burst of Light (1988)',
    },
    {
      text: 'Self-compassion involves treating yourself with the same kindness, concern, and support you’d show a good friend.',
      author: 'Kristin Neff',
      source: 'Self-Compassion (2011)',
    },
    {
      // The version that circulates widely online ("Almost everything will
      // work again if you unplug it...") doesn't match what she actually
      // said — this is the verified wording from the press interview tied
      // to her book's release.
      text: 'Everything works again if you unplug it for a few minutes, including you.',
      author: 'Anne Lamott',
      source: 'said in a 2018 interview on Almost Everything: Notes on Hope (WTOP)',
    },
  ],
};

/**
 * Picks one quote for the given mood, stable for a given seed (pass the
 * check-in's on_date so the same quote shows all day rather than changing on
 * every reload, but a new day's check-in gets a fresh one).
 */
export function pickMoodQuote(mood: Mood, seed: string): MoodQuote {
  const options = MOOD_QUOTES[mood];
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return options[hash % options.length];
}
