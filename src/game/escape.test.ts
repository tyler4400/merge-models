import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ESCAPE, SHAKE, TANK, VIEW } from "./constants.ts";
import { isPerchedOnRim, shouldDestroyEscaped } from "./escape.ts";

const outerX = TANK.innerWidth / 2 + TANK.wall;
const rimY = TANK.innerHeight + TANK.wall / 2;

describe("shouldDestroyEscaped", () => {
  it("默认开启；缸内飞高、超出屏幕顶及回落均保留", () => {
    assert.equal(SHAKE.destroyEscaped, true);
    for (const x of [-3, 0, 3]) for (const y of [1, rimY, VIEW.yMax + 10, 199]) {
      assert.equal(shouldDestroyEscaped({ x, y }), false);
    }
  });

  it("中心越过任一侧墙外沿且低于墙顶才销毁", () => {
    for (const sign of [-1, 1]) {
      assert.equal(shouldDestroyEscaped({ x: sign * (outerX + 0.01), y: rimY - 0.01 }), true);
      assert.equal(shouldDestroyEscaped({ x: sign * outerX, y: rimY - 0.01 }), false);
      assert.equal(shouldDestroyEscaped({ x: sign * (outerX - 0.01), y: rimY - 0.01 }), false);
    }
  });

  it("墙外但在墙顶或以上暂不销毁，允许回缸", () => {
    for (const sign of [-1, 1]) for (const y of [rimY, rimY + 0.01, VIEW.yMax + 10]) {
      assert.equal(shouldDestroyEscaped({ x: sign * (outerX + 2), y }), false);
    }
  });

  it("掉出地板余量以下销毁，与横坐标无关", () => {
    assert.equal(shouldDestroyEscaped({ x: 0, y: -ESCAPE.belowFloorMargin }), false);
    assert.equal(shouldDestroyEscaped({ x: 0, y: -ESCAPE.belowFloorMargin - 0.01 }), true);
  });

  it("关闭开关保留瓶外和地板以下的球", () => {
    for (const x of [-outerX - 1, 0, outerX + 1]) for (const y of [rimY - 1, -3, -49]) {
      assert.equal(shouldDestroyEscaped({ x, y }, false), false);
    }
  });

  it("非常宽松的安全边界始终生效，严格越界才销毁", () => {
    for (const enabled of [true, false]) {
      for (const x of [-ESCAPE.safetyAbsX - 0.01, ESCAPE.safetyAbsX + 0.01]) {
        assert.equal(shouldDestroyEscaped({ x, y: rimY + 1 }, enabled), true);
      }
      for (const y of [ESCAPE.safetyMaxY + 0.01, ESCAPE.safetyMinY - 0.01]) {
        assert.equal(shouldDestroyEscaped({ x: 0, y }, enabled), true);
      }
    }
    assert.equal(shouldDestroyEscaped({ x: ESCAPE.safetyAbsX, y: ESCAPE.safetyMaxY }, false), false);
    assert.equal(shouldDestroyEscaped({ x: -ESCAPE.safetyAbsX, y: ESCAPE.safetyMinY }, false), false);
  });
});

describe("isPerchedOnRim", () => {
  const innerX = TANK.innerWidth / 2;
  it("中心越过内壁、在墙顶或以上且几乎不动时判为停在墙顶", () => {
    for (const sign of [-1, 1]) {
      assert.equal(isPerchedOnRim({ x: sign * (innerX + 0.2), y: rimY + 0.5 }, 0.1), true);
    }
  });
  it("缸内、墙顶以下或仍在运动时不算", () => {
    assert.equal(isPerchedOnRim({ x: innerX - 0.1, y: rimY + 0.5 }, 0.1), false);
    assert.equal(isPerchedOnRim({ x: innerX + 0.2, y: rimY - 0.1 }, 0.1), false);
    assert.equal(isPerchedOnRim({ x: innerX + 0.2, y: rimY + 0.5 }, ESCAPE.perchSpeed + 0.1), false);
  });
});
