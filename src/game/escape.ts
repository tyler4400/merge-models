/** 纯位置判定：不以屏幕边缘或球顶为界，飞高后落回缸内仍可合成。 */
import { ESCAPE, SHAKE, TANK } from "./constants.ts";

export function shouldDestroyEscaped(
  position: { x: number; y: number },
  destroyEscaped: boolean = SHAKE.destroyEscaped,
): boolean {
  const { x, y } = position;
  // 仅兜底丢失刚体；关闭普通出缸销毁时仍生效。
  if (Math.abs(x) > ESCAPE.safetyAbsX || y > ESCAPE.safetyMaxY || y < ESCAPE.safetyMinY) return true;
  if (!destroyEscaped) return false;
  // physics.ts: 侧墙高 h+t、中心 h/2，外沿 w/2+t；地板也仅延伸至此外沿。
  return (Math.abs(x) > TANK.innerWidth / 2 + TANK.wall && y < TANK.innerHeight + TANK.wall / 2)
    || y < -ESCAPE.belowFloorMargin;
}

/**
 * 球被抛到侧墙顶上停住（中心已越过内壁、高于墙顶、几乎不动）时，既不在缸内也不会掉出去，
 * 还会高于警戒线导致误判负；Game 连续 ESCAPE.perchSec 满足此条件就按出缸销毁。
 */
export function isPerchedOnRim(position: { x: number; y: number }, speed: number): boolean {
  return Math.abs(position.x) > TANK.innerWidth / 2
    && position.y >= TANK.innerHeight + TANK.wall / 2
    && speed < ESCAPE.perchSpeed;
}
