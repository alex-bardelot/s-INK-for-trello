import {rectContains} from '../src/components/CommentComposer';

describe('rectContains', () => {
  const field = {x: 100, y: 200, width: 300, height: 50};

  it('finds a tap on the comment field, edges included', () => {
    expect(rectContains(field, 250, 225)).toBe(true);
    expect(rectContains(field, 100, 200)).toBe(true);
    expect(rectContains(field, 400, 250)).toBe(true);
  });

  it('tells a tap beside the field', () => {
    expect(rectContains(field, 99, 225)).toBe(false);
    expect(rectContains(field, 401, 225)).toBe(false);
    expect(rectContains(field, 250, 199)).toBe(false);
    expect(rectContains(field, 250, 251)).toBe(false);
  });

  it('counts every tap as beside a field not measured yet', () => {
    expect(rectContains(null, 250, 225)).toBe(false);
  });
});
