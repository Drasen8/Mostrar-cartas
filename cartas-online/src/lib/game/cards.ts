export type CardSuit = 'oros' | 'copas' | 'espadas' | 'bastos';
export type CardValue = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 10 | 11 | 12;
export interface Card { suit: CardSuit; value: CardValue; }

export function createSpanishDeck(): Card[] {
  const suits: CardSuit[] = ['oros', 'copas', 'espadas', 'bastos'];
  const values: CardValue[] = [1,2,3,4,5,6,7,10,11,12];
  const deck: Card[] = [];
  for (const s of suits) for (const v of values) deck.push({ suit: s, value: v });
  // Fisher–Yates shuffle
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}