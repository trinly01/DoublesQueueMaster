// Pickleball serve-side rule (USA Pickleball 5.A.1): the right/even service
// court is defined per half from the server's perspective facing the net.
// In court coordinates the z>0 half faces -z so its right/even court is +x;
// the z<0 half faces +z so its right/even court is -x.

/** +1 = +x side, -1 = -x side. Where the server stands for a given score. */
export const serveCourtSign = (
  score: number,
  onPositiveZHalf: boolean,
): 1 | -1 => ((score % 2 === 0) === onPositiveZHalf ? 1 : -1);

/** Is world X position on the right/even court for that half? */
export const isRightCourt = (x: number, onPositiveZHalf: boolean): boolean =>
  onPositiveZHalf ? x > 0 : x < 0;
