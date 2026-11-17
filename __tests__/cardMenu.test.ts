import {MenuRect, placeCardMenu} from '../src/board/cardMenu';

const page = {width: 1200, height: 1600};
const menu = {width: 300, height: 280};
const GAP = 8;

const place = (card: MenuRect) => placeCardMenu(card, menu, page, GAP);

describe('placeCardMenu', () => {
  it('stands on the right of the card when there is room', () => {
    expect(place({left: 16, top: 200, width: 380, height: 120})).toEqual({
      side: 'right',
      left: 404,
      top: 200,
    });
  });

  it('stands on the left of a card of the last column', () => {
    expect(place({left: 804, top: 200, width: 380, height: 120})).toEqual({
      side: 'left',
      left: 496,
      top: 200,
    });
  });

  it('prefers the right when both sides have room', () => {
    expect(place({left: 410, top: 200, width: 380, height: 120}).side).toBe(
      'right',
    );
  });

  it('overlaps a card as wide as the page, on its roomier side', () => {
    const placement = place({left: 16, top: 200, width: 1100, height: 120});
    expect(placement.side).toBe('right');
    expect(placement.left).toBe(page.width - GAP - menu.width);
  });

  it('overlaps on the left when the left side is roomier', () => {
    const placement = place({left: 150, top: 200, width: 1040, height: 120});
    expect(placement.side).toBe('left');
    expect(placement.left).toBe(GAP);
  });

  it('moves up for a card near the bottom of the page', () => {
    expect(place({left: 16, top: 1500, width: 380, height: 90}).top).toBe(
      page.height - GAP - menu.height,
    );
  });

  it('keeps the top within the page', () => {
    expect(place({left: 16, top: -40, width: 380, height: 90}).top).toBe(GAP);
  });
});
