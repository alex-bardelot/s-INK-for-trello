import {pickerPosition} from '../src/components/FloatingPicker';

/** An area the height of the tablet's page, from the top of the window. */
const AREA = {x: 0, y: 0, width: 1400, height: 1800};
const button = (y: number) => ({x: 100, y, width: 120, height: 40});

describe('pickerPosition', () => {
  it('opens under a button high on the page', () => {
    expect(pickerPosition(button(200), AREA)).toEqual({
      left: 100,
      top: 244,
      maxHeight: 520,
    });
  });

  it('opens above a button near the bottom, inside the area', () => {
    const position = pickerPosition(button(1600), AREA);
    expect(position.top).toBeUndefined();
    // Its bottom lies just above the button...
    expect(position.bottom).toBe(1800 - 1600 + 4);
    // ...and it never reaches past the area's top.
    expect(position.maxHeight).toBe(520);
  });

  it('never runs past the bottom of the area under the button', () => {
    // Little room either way: the larger side, never more than it holds.
    const short = {x: 0, y: 0, width: 1400, height: 400};
    const position = pickerPosition(button(180), short);
    expect(position.top).toBe(224);
    expect(position.maxHeight).toBe(400 - 224 - 16);
    const above = pickerPosition(button(300), short);
    expect(above.bottom).toBe(400 - 300 + 4);
    expect(above.maxHeight).toBe(300 - 4 - 16);
  });

  it('opens under the button in an area that grows to hold it', () => {
    expect(pickerPosition(button(1600), AREA, {canGrow: true})).toEqual({
      left: 100,
      top: 1644,
      maxHeight: 240,
    });
  });

  it('keeps the list within the width of the area', () => {
    const right = {x: 1300, y: 200, width: 80, height: 40};
    expect(pickerPosition(right, AREA).left).toBe(1400 - 440);
  });
});
